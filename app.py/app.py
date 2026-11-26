import re
import sqlite3
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory


FLOORS = 5
ROWS = 20
COLS = 10
AISLE_AFTER = 5
REPORT_TTL_SECONDS = 60 * 60
APP_DIR = Path(__file__).resolve().parent

app = Flask(__name__, static_folder="static")
app.config["DATABASE"] = str(APP_DIR / "seats.db")


@contextmanager
def database():
    connection = sqlite3.connect(app.config["DATABASE"], timeout=10)
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def initialize_database():
    with database() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS seat_reports (
                floor INTEGER NOT NULL,
                seat_id TEXT NOT NULL,
                status TEXT NOT NULL CHECK (status IN ('available', 'occupied')),
                updated_at REAL NOT NULL,
                PRIMARY KEY (floor, seat_id)
            )
            """
        )


def valid_floor(value):
    return type(value) is int and 1 <= value <= FLOORS


def valid_seat_id(value):
    if not isinstance(value, str) or not re.fullmatch(r"[A-T](?:10|[1-9])", value):
        return False
    return True


def floor_summaries(connection, cutoff):
    reports = connection.execute(
        """
        SELECT floor, status, COUNT(*)
        FROM seat_reports
        WHERE updated_at > ?
        GROUP BY floor, status
        """,
        (cutoff,),
    ).fetchall()
    totals = {
        floor: {"available": 0, "occupied": 0}
        for floor in range(1, FLOORS + 1)
    }
    for floor, status, count in reports:
        totals[floor][status] = count
    return [
        {
            "floor": floor,
            "available": totals[floor]["available"],
            "occupied": totals[floor]["occupied"],
            "unknown": ROWS * COLS - totals[floor]["available"] - totals[floor]["occupied"],
        }
        for floor in range(1, FLOORS + 1)
    ]


@app.get("/")
def home():
    return send_from_directory(app.static_folder, "index.html")


@app.get("/api/seats")
def get_seats():
    floor_text = request.args.get("floor", "1")
    if not floor_text.isdecimal() or not valid_floor(int(floor_text)):
        return jsonify(error="Choose a floor from 1 to 5."), 400
    floor = int(floor_text)
    cutoff = time.time() - REPORT_TTL_SECONDS

    with database() as connection:
        rows = connection.execute(
            """
            SELECT seat_id, status, updated_at
            FROM seat_reports
            WHERE floor = ? AND updated_at > ?
            """,
            (floor, cutoff),
        ).fetchall()
        summaries = floor_summaries(connection, cutoff)

    reported = {
        seat_id: {
            "status": status,
            "updated_at": datetime.fromtimestamp(updated_at, timezone.utc).isoformat(),
        }
        for seat_id, status, updated_at in rows
    }
    seats = []
    for row_index in range(ROWS):
        for col in range(1, COLS + 1):
            seat_id = f"{chr(ord('A') + row_index)}{col}"
            report = reported.get(seat_id, {})
            seats.append(
                {
                    "id": seat_id,
                    "row": chr(ord("A") + row_index),
                    "col": col,
                    "status": report.get("status", "unknown"),
                    "updated_at": report.get("updated_at"),
                }
            )

    return jsonify(floor=floor, seats=seats, floors=summaries)


@app.post("/api/report")
def report_seats():
    if not request.is_json:
        return jsonify(error="Send the report as JSON."), 400
    payload = request.get_json()
    if not isinstance(payload, dict) or not valid_floor(payload.get("floor")):
        return jsonify(error="Choose a floor from 1 to 5."), 400

    reports = payload.get("seats")
    if not isinstance(reports, list) or not 1 <= len(reports) <= 4:
        return jsonify(error="Report between 1 and 4 seats at a time."), 400

    seen = set()
    for report in reports:
        if not isinstance(report, dict):
            return jsonify(error="Each seat report must include a seat and status."), 400
        seat_id = report.get("id")
        status = report.get("status")
        if not valid_seat_id(seat_id) or seat_id in seen:
            return jsonify(error="One or more seat numbers are invalid or duplicated."), 400
        if status not in ("available", "occupied", "unknown"):
            return jsonify(error="Seat status must be available, occupied, or unknown."), 400
        seen.add(seat_id)

    updated_at = time.time()
    with database() as connection:
        for report in reports:
            if report["status"] == "unknown":
                connection.execute(
                    "DELETE FROM seat_reports WHERE floor = ? AND seat_id = ?",
                    (payload["floor"], report["id"]),
                )
            else:
                connection.execute(
                    """
                    INSERT INTO seat_reports (floor, seat_id, status, updated_at)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(floor, seat_id) DO UPDATE SET
                        status = excluded.status,
                        updated_at = excluded.updated_at
                    """,
                    (payload["floor"], report["id"], report["status"], updated_at),
                )

    return jsonify(ok=True)


initialize_database()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
