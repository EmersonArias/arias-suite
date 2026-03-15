import sqlite3
from pathlib import Path

from flask import Flask, flash, g, redirect, render_template, request, url_for


BASE_DIR = Path(__file__).resolve().parent
DATABASE = BASE_DIR / "database.db"

app = Flask(__name__)
app.config["SECRET_KEY"] = "hotel-maintenance-secret-key"


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = sqlite3.connect(DATABASE)
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(_: object) -> None:
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db() -> None:
    db = sqlite3.connect(DATABASE)
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS rooms (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            number TEXT NOT NULL UNIQUE,
            floor TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'Available'
        );

        CREATE TABLE IF NOT EXISTS technicians (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            specialty TEXT NOT NULL,
            available INTEGER NOT NULL DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS issues (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            room_id INTEGER NOT NULL,
            description TEXT NOT NULL,
            priority TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'Open',
            technician_id INTEGER,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (room_id) REFERENCES rooms (id),
            FOREIGN KEY (technician_id) REFERENCES technicians (id)
        );
        """
    )
    db.commit()

    room_count = db.execute("SELECT COUNT(*) FROM rooms").fetchone()[0]
    technician_count = db.execute("SELECT COUNT(*) FROM technicians").fetchone()[0]

    if room_count == 0:
        db.executemany(
            "INSERT INTO rooms (number, floor, status) VALUES (?, ?, ?)",
            [("101", "1", "Available"), ("203", "2", "Available")],
        )

    if technician_count == 0:
        db.executemany(
            "INSERT INTO technicians (name, specialty, available) VALUES (?, ?, ?)",
            [("Ana", "Electrical", 1), ("Luis", "Plumbing", 1)],
        )

    db.commit()
    db.close()


class Room:
    def __init__(self, number: str, floor: str, status: str = "Available") -> None:
        self.number = number
        self.floor = floor
        self.status = status


class Technician:
    def __init__(self, name: str, specialty: str, available: bool = True) -> None:
        self.name = name
        self.specialty = specialty
        self.available = available


class Issue:
    def __init__(
        self,
        room_id: int,
        description: str,
        priority: str,
        status: str = "Open",
        technician_id: int | None = None,
    ) -> None:
        self.room_id = room_id
        self.description = description
        self.priority = priority
        self.status = status
        self.technician_id = technician_id


class HotelMaintenanceSystem:
    def __init__(self, db: sqlite3.Connection) -> None:
        self.db = db

    def add_room(self, room: Room) -> None:
        self.db.execute(
            "INSERT INTO rooms (number, floor, status) VALUES (?, ?, ?)",
            (room.number, room.floor, room.status),
        )
        self.db.commit()

    def add_technician(self, technician: Technician) -> None:
        self.db.execute(
            "INSERT INTO technicians (name, specialty, available) VALUES (?, ?, ?)",
            (technician.name, technician.specialty, int(technician.available)),
        )
        self.db.commit()

    def report_issue(self, issue: Issue) -> None:
        self.db.execute(
            "UPDATE rooms SET status = ? WHERE id = ?",
            ("Needs Maintenance", issue.room_id),
        )
        self.db.execute(
            """
            INSERT INTO issues (room_id, description, priority, status, technician_id)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                issue.room_id,
                issue.description,
                issue.priority,
                issue.status,
                issue.technician_id,
            ),
        )
        self.db.commit()

    def assign_technician(self, issue_id: int, technician_id: int) -> bool:
        issue = self.db.execute(
            "SELECT id, technician_id FROM issues WHERE id = ?",
            (issue_id,),
        ).fetchone()
        technician = self.db.execute(
            "SELECT id, available FROM technicians WHERE id = ?",
            (technician_id,),
        ).fetchone()

        if issue is None or technician is None or technician["available"] == 0:
            return False

        if issue["technician_id"] is not None:
            self.db.execute(
                "UPDATE technicians SET available = 1 WHERE id = ?",
                (issue["technician_id"],),
            )

        self.db.execute(
            "UPDATE issues SET technician_id = ?, status = ? WHERE id = ?",
            (technician_id, "Assigned", issue_id),
        )
        self.db.execute(
            "UPDATE technicians SET available = 0 WHERE id = ?",
            (technician_id,),
        )
        self.db.commit()
        return True

    def resolve_issue(self, issue_id: int) -> bool:
        issue = self.db.execute(
            "SELECT room_id, technician_id FROM issues WHERE id = ?",
            (issue_id,),
        ).fetchone()
        if issue is None:
            return False

        self.db.execute(
            "UPDATE issues SET status = ? WHERE id = ?",
            ("Resolved", issue_id),
        )
        self.db.execute(
            "UPDATE rooms SET status = ? WHERE id = ?",
            ("Available", issue["room_id"]),
        )

        if issue["technician_id"] is not None:
            self.db.execute(
                "UPDATE technicians SET available = 1 WHERE id = ?",
                (issue["technician_id"],),
            )

        self.db.commit()
        return True

    def get_rooms(self) -> list[sqlite3.Row]:
        return self.db.execute(
            "SELECT id, number, floor, status FROM rooms ORDER BY number"
        ).fetchall()

    def get_technicians(self) -> list[sqlite3.Row]:
        return self.db.execute(
            "SELECT id, name, specialty, available FROM technicians ORDER BY name"
        ).fetchall()

    def get_issue(self, issue_id: int) -> sqlite3.Row | None:
        return self.db.execute(
            """
            SELECT issues.*, rooms.number AS room_number, technicians.name AS technician_name
            FROM issues
            JOIN rooms ON rooms.id = issues.room_id
            LEFT JOIN technicians ON technicians.id = issues.technician_id
            WHERE issues.id = ?
            """,
            (issue_id,),
        ).fetchone()

    def get_open_issues(self) -> list[sqlite3.Row]:
        return self.db.execute(
            """
            SELECT issues.*, rooms.number AS room_number, technicians.name AS technician_name
            FROM issues
            JOIN rooms ON rooms.id = issues.room_id
            LEFT JOIN technicians ON technicians.id = issues.technician_id
            WHERE issues.status != 'Resolved'
            ORDER BY
                CASE issues.priority
                    WHEN 'High' THEN 1
                    WHEN 'Medium' THEN 2
                    ELSE 3
                END,
                issues.created_at DESC
            """
        ).fetchall()

    def get_resolved_issues(self) -> list[sqlite3.Row]:
        return self.db.execute(
            """
            SELECT issues.*, rooms.number AS room_number, technicians.name AS technician_name
            FROM issues
            JOIN rooms ON rooms.id = issues.room_id
            LEFT JOIN technicians ON technicians.id = issues.technician_id
            WHERE issues.status = 'Resolved'
            ORDER BY issues.created_at DESC
            """
        ).fetchall()

    def dashboard_stats(self) -> dict[str, int]:
        return {
            "rooms": self.db.execute("SELECT COUNT(*) FROM rooms").fetchone()[0],
            "technicians": self.db.execute("SELECT COUNT(*) FROM technicians").fetchone()[0],
            "open_issues": self.db.execute(
                "SELECT COUNT(*) FROM issues WHERE status != 'Resolved'"
            ).fetchone()[0],
            "resolved_issues": self.db.execute(
                "SELECT COUNT(*) FROM issues WHERE status = 'Resolved'"
            ).fetchone()[0],
        }


def service() -> HotelMaintenanceSystem:
    return HotelMaintenanceSystem(get_db())


@app.route("/")
def dashboard() -> str:
    system = service()
    return render_template(
        "dashboard.html",
        stats=system.dashboard_stats(),
        open_issues=system.get_open_issues()[:5],
    )


@app.route("/rooms", methods=["GET", "POST"])
def rooms() -> str:
    system = service()

    if request.method == "POST":
        number = request.form.get("number", "").strip()
        floor = request.form.get("floor", "").strip()

        if not number or not floor:
            flash("Room number and floor are required.", "error")
        else:
            try:
                system.add_room(Room(number=number, floor=floor))
                flash("Room added successfully.", "success")
                return redirect(url_for("rooms"))
            except sqlite3.IntegrityError:
                flash("That room number already exists.", "error")

    return render_template("rooms.html", rooms=system.get_rooms())


@app.route("/technicians", methods=["GET", "POST"])
def technicians() -> str:
    system = service()

    if request.method == "POST":
        name = request.form.get("name", "").strip()
        specialty = request.form.get("specialty", "").strip()

        if not name or not specialty:
            flash("Technician name and specialty are required.", "error")
        else:
            system.add_technician(Technician(name=name, specialty=specialty))
            flash("Technician added successfully.", "success")
            return redirect(url_for("technicians"))

    return render_template("technicians.html", technicians=system.get_technicians())


@app.route("/issues")
def issues() -> str:
    system = service()
    return render_template(
        "issues.html",
        open_issues=system.get_open_issues(),
        resolved_issues=system.get_resolved_issues(),
    )


@app.route("/issues/create", methods=["GET", "POST"])
def create_issue() -> str:
    system = service()

    if request.method == "POST":
        room_id = request.form.get("room_id", "").strip()
        description = request.form.get("description", "").strip()
        priority = request.form.get("priority", "").strip()

        if not room_id or not description or not priority:
            flash("All issue fields are required.", "error")
        else:
            system.report_issue(
                Issue(room_id=int(room_id), description=description, priority=priority)
            )
            flash("Issue reported successfully.", "success")
            return redirect(url_for("issues"))

    return render_template("create_issue.html", rooms=system.get_rooms())


@app.route("/issues/<int:issue_id>/assign", methods=["GET", "POST"])
def assign_technician(issue_id: int) -> str:
    system = service()
    issue = system.get_issue(issue_id)

    if issue is None:
        flash("Issue not found.", "error")
        return redirect(url_for("issues"))

    if request.method == "POST":
        technician_id = request.form.get("technician_id", "").strip()

        if not technician_id:
            flash("Select a technician.", "error")
        elif system.assign_technician(issue_id, int(technician_id)):
            flash("Technician assigned successfully.", "success")
            return redirect(url_for("issues"))
        else:
            flash("Selected technician is not available.", "error")

    return render_template(
        "assign_technician.html",
        issue=issue,
        technicians=system.get_technicians(),
    )


@app.post("/issues/<int:issue_id>/resolve")
def resolve_issue(issue_id: int) -> str:
    if service().resolve_issue(issue_id):
        flash("Issue marked as resolved.", "success")
    else:
        flash("Issue not found.", "error")
    return redirect(url_for("issues"))


if __name__ == "__main__":
    import os
    init_db()
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port)