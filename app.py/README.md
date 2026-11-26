# Library Seat Finder

A shared seat board for five library floors with 200 seats per floor. Seat
reports are saved in SQLite and automatically become unknown after one hour.
The map assumes 20 rows (A–T) and 10 seats per row; the aisle is after seat 5.

## Run on Windows

Open PowerShell in this folder and run:

```powershell
python -m pip install -r requirements.txt
python app.py
```

Open <http://127.0.0.1:5000>. To let other students on the same Wi-Fi use it,
they can open `http://YOUR-COMPUTER-IP:5000` while the server is running. You
may need to allow Python through Windows Firewall. This starter version has no
student accounts, so anyone who can reach the server can update seat reports.
