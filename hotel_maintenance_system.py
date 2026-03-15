import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional
import tkinter as tk
from tkinter import messagebox, simpledialog, ttk


DATA_FILE = Path(__file__).with_name("hotel_maintenance_data.json")


@dataclass
class Room:
    number: int
    floor: int
    status: str = "Available"


@dataclass
class Technician:
    technician_id: int
    name: str
    specialty: str
    available: bool = True


@dataclass
class Issue:
    issue_id: int
    room: Room
    description: str
    priority: str
    status: str = "Open"
    technician: Optional[Technician] = None


@dataclass
class HotelMaintenanceSystem:
    rooms: List[Room] = field(default_factory=list)
    technicians: List[Technician] = field(default_factory=list)
    issues: List[Issue] = field(default_factory=list)

    def add_room(self, room: Room) -> None:
        self.rooms.append(room)

    def add_technician(self, technician: Technician) -> None:
        self.technicians.append(technician)

    def report_issue(self, issue: Issue) -> None:
        issue.room.status = "Needs Maintenance"
        self.issues.append(issue)

    def assign_technician(self, issue_id: int, technician_id: int) -> bool:
        issue = self._find_issue(issue_id)
        technician = self._find_technician(technician_id)

        if issue is None or technician is None or not technician.available:
            return False

        issue.technician = technician
        issue.status = "Assigned"
        technician.available = False
        return True

    def list_open_issues(self) -> List[Issue]:
        return [issue for issue in self.issues if issue.status != "Resolved"]

    def _find_issue(self, issue_id: int) -> Optional[Issue]:
        return next((issue for issue in self.issues if issue.issue_id == issue_id), None)

    def _find_technician(self, technician_id: int) -> Optional[Technician]:
        return next(
            (technician for technician in self.technicians if technician.technician_id == technician_id),
            None,
        )


def find_room(system: HotelMaintenanceSystem, room_number: int) -> Optional[Room]:
    return next((room for room in system.rooms if room.number == room_number), None)


def save_data(system: HotelMaintenanceSystem) -> None:
    data = {
        "rooms": [
            {"number": room.number, "floor": room.floor, "status": room.status}
            for room in system.rooms
        ],
        "technicians": [
            {
                "technician_id": technician.technician_id,
                "name": technician.name,
                "specialty": technician.specialty,
                "available": technician.available,
            }
            for technician in system.technicians
        ],
        "issues": [
            {
                "issue_id": issue.issue_id,
                "room_number": issue.room.number,
                "description": issue.description,
                "priority": issue.priority,
                "status": issue.status,
                "technician_id": (
                    issue.technician.technician_id if issue.technician is not None else None
                ),
            }
            for issue in system.issues
        ],
    }
    DATA_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")


def seed_data(system: HotelMaintenanceSystem) -> None:
    system.add_room(Room(number=101, floor=1))
    system.add_room(Room(number=203, floor=2))
    system.add_technician(Technician(technician_id=1, name="Ana", specialty="Electrical"))
    system.add_technician(Technician(technician_id=2, name="Luis", specialty="Plumbing"))


def load_data() -> HotelMaintenanceSystem:
    system = HotelMaintenanceSystem()

    if not DATA_FILE.exists():
        seed_data(system)
        save_data(system)
        return system

    data = json.loads(DATA_FILE.read_text(encoding="utf-8"))

    for room_data in data.get("rooms", []):
        system.add_room(
            Room(
                number=room_data["number"],
                floor=room_data["floor"],
                status=room_data.get("status", "Available"),
            )
        )

    for technician_data in data.get("technicians", []):
        system.add_technician(
            Technician(
                technician_id=technician_data["technician_id"],
                name=technician_data["name"],
                specialty=technician_data["specialty"],
                available=technician_data.get("available", True),
            )
        )

    for issue_data in data.get("issues", []):
        room = find_room(system, issue_data["room_number"])
        if room is None:
            continue

        technician = None
        technician_id = issue_data.get("technician_id")
        if technician_id is not None:
            technician = system._find_technician(technician_id)

        system.issues.append(
            Issue(
                issue_id=issue_data["issue_id"],
                room=room,
                description=issue_data["description"],
                priority=issue_data["priority"],
                status=issue_data.get("status", "Open"),
                technician=technician,
            )
        )

    return system


class HotelMaintenanceApp:
    def __init__(self, root: tk.Tk, system: HotelMaintenanceSystem) -> None:
        self.root = root
        self.system = system

        self.root.title("Hotel Maintenance Manager")
        self.root.geometry("980x560")
        self.root.minsize(820, 480)

        self._build_layout()
        self.refresh_views()

    def _build_layout(self) -> None:
        container = ttk.Frame(self.root, padding=16)
        container.pack(fill="both", expand=True)

        button_row = ttk.Frame(container)
        button_row.pack(fill="x", pady=(0, 16))

        ttk.Button(button_row, text="Add Room", command=self.add_room).pack(side="left", padx=(0, 8))
        ttk.Button(button_row, text="Add Technician", command=self.add_technician).pack(side="left", padx=(0, 8))
        ttk.Button(button_row, text="Report Issue", command=self.report_issue).pack(side="left", padx=(0, 8))
        ttk.Button(button_row, text="Assign Technician", command=self.assign_technician).pack(side="left", padx=(0, 8))
        ttk.Button(button_row, text="List Issues", command=self.refresh_views).pack(side="left")

        sections = ttk.Frame(container)
        sections.pack(fill="both", expand=True)
        sections.columnconfigure(0, weight=1)
        sections.columnconfigure(1, weight=1)
        sections.columnconfigure(2, weight=2)
        sections.rowconfigure(0, weight=1)

        self.rooms_text = self._create_text_section(sections, "Rooms", 0)
        self.technicians_text = self._create_text_section(sections, "Technicians", 1)
        self.issues_text = self._create_text_section(sections, "Issues", 2)

    def _create_text_section(self, parent: ttk.Frame, title: str, column: int) -> tk.Text:
        frame = ttk.LabelFrame(parent, text=title, padding=10)
        frame.grid(row=0, column=column, sticky="nsew", padx=(0 if column == 0 else 8, 0))
        frame.rowconfigure(0, weight=1)
        frame.columnconfigure(0, weight=1)

        text = tk.Text(frame, wrap="word", height=20, width=30)
        text.grid(row=0, column=0, sticky="nsew")

        scrollbar = ttk.Scrollbar(frame, orient="vertical", command=text.yview)
        scrollbar.grid(row=0, column=1, sticky="ns")
        text.configure(yscrollcommand=scrollbar.set, state="disabled")
        return text

    def _set_text(self, widget: tk.Text, content: str) -> None:
        widget.configure(state="normal")
        widget.delete("1.0", tk.END)
        widget.insert(tk.END, content)
        widget.configure(state="disabled")

    def refresh_views(self) -> None:
        rooms_content = "\n".join(
            f"Room {room.number}\nFloor: {room.floor}\nStatus: {room.status}\n"
            for room in self.system.rooms
        ) or "No rooms available."

        technicians_content = "\n".join(
            (
                f"ID: {technician.technician_id}\n"
                f"Name: {technician.name}\n"
                f"Specialty: {technician.specialty}\n"
                f"Available: {'Yes' if technician.available else 'No'}\n"
            )
            for technician in self.system.technicians
        ) or "No technicians available."

        issues_content = "\n".join(
            (
                f"Issue #{issue.issue_id}\n"
                f"Room: {issue.room.number}\n"
                f"Description: {issue.description}\n"
                f"Priority: {issue.priority}\n"
                f"Status: {issue.status}\n"
                f"Technician: {issue.technician.name if issue.technician else 'Unassigned'}\n"
            )
            for issue in self.system.issues
        ) or "No issues reported."

        self._set_text(self.rooms_text, rooms_content)
        self._set_text(self.technicians_text, technicians_content)
        self._set_text(self.issues_text, issues_content)

    def add_room(self) -> None:
        number = simpledialog.askinteger("Add Room", "Room number:", parent=self.root)
        if number is None:
            return

        floor = simpledialog.askinteger("Add Room", "Floor:", parent=self.root)
        if floor is None:
            return

        if find_room(self.system, number) is not None:
            messagebox.showerror("Add Room", "Room already exists.")
            return

        self.system.add_room(Room(number=number, floor=floor))
        save_data(self.system)
        self.refresh_views()
        messagebox.showinfo("Add Room", "Room added successfully.")

    def add_technician(self) -> None:
        technician_id = simpledialog.askinteger("Add Technician", "Technician ID:", parent=self.root)
        if technician_id is None:
            return

        name = simpledialog.askstring("Add Technician", "Technician name:", parent=self.root)
        if not name:
            return

        specialty = simpledialog.askstring("Add Technician", "Specialty:", parent=self.root)
        if not specialty:
            return

        if self.system._find_technician(technician_id) is not None:
            messagebox.showerror("Add Technician", "Technician ID already exists.")
            return

        technician = Technician(
            technician_id=technician_id,
            name=name.strip(),
            specialty=specialty.strip(),
        )
        self.system.add_technician(technician)
        save_data(self.system)
        self.refresh_views()
        messagebox.showinfo("Add Technician", "Technician added successfully.")

    def report_issue(self) -> None:
        issue_id = simpledialog.askinteger("Report Issue", "Issue ID:", parent=self.root)
        if issue_id is None:
            return

        room_number = simpledialog.askinteger("Report Issue", "Room number:", parent=self.root)
        if room_number is None:
            return

        description = simpledialog.askstring("Report Issue", "Issue description:", parent=self.root)
        if not description:
            return

        priority = simpledialog.askstring("Report Issue", "Priority (Low/Medium/High):", parent=self.root)
        if not priority:
            return

        room = find_room(self.system, room_number)
        if room is None:
            messagebox.showerror("Report Issue", "Room not found.")
            return

        if self.system._find_issue(issue_id) is not None:
            messagebox.showerror("Report Issue", "Issue ID already exists.")
            return

        issue = Issue(
            issue_id=issue_id,
            room=room,
            description=description.strip(),
            priority=priority.strip(),
        )
        self.system.report_issue(issue)
        save_data(self.system)
        self.refresh_views()
        messagebox.showinfo("Report Issue", "Issue reported successfully.")

    def assign_technician(self) -> None:
        issue_id = simpledialog.askinteger("Assign Technician", "Issue ID:", parent=self.root)
        if issue_id is None:
            return

        technician_id = simpledialog.askinteger(
            "Assign Technician",
            "Technician ID:",
            parent=self.root,
        )
        if technician_id is None:
            return

        if not self.system.assign_technician(issue_id, technician_id):
            messagebox.showerror(
                "Assign Technician",
                "Assignment failed. Check issue ID, technician ID, or availability.",
            )
            return

        save_data(self.system)
        self.refresh_views()
        messagebox.showinfo("Assign Technician", "Technician assigned successfully.")


def main() -> None:
    system = load_data()
    root = tk.Tk()
    HotelMaintenanceApp(root, system)
    root.mainloop()


if __name__ == "__main__":
    main()
