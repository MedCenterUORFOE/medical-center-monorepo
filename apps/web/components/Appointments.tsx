"use client";

import { useState } from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import type { Appointment } from "./types";
import type { DataStore } from "./data-store";
import { genId } from "./data-store";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";

const empty: Omit<Appointment, "id"> = {
  studentId: "",
  studentName: "",
  date: "",
  time: "",
  doctor: "",
  reason: "",
  status: "Scheduled",
};

export function Appointments({ store }: { store: DataStore }) {
  const { appointments, setAppointments, students } = store;
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [form, setForm] = useState(empty);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("All");

  const filtered = appointments.filter((appointment) => {
    const matches = `${appointment.studentName} ${appointment.studentId} ${appointment.doctor} ${appointment.reason}`
      .toLowerCase()
      .includes(search.toLowerCase());
    const status = filter === "All" || appointment.status === filter;
    return matches && status;
  });

  const openNew = () => {
    setEditing(null);
    setForm(empty);
    setOpen(true);
  };

  const openEdit = (appointment: Appointment) => {
    setEditing(appointment);
    setForm(appointment);
    setOpen(true);
  };

  const save = () => {
    if (!form.studentId || !form.date || !form.time) {
      toast.error("Please fill student, date and time");
      return;
    }

    const student = students.find((value) => value.studentId === form.studentId);
    const studentName = student?.name || form.studentName;

    if (editing) {
      setAppointments(appointments.map((appointment) => (appointment.id === editing.id ? { ...form, studentName, id: editing.id } : appointment)));
      toast.success("Appointment updated");
    } else {
      setAppointments([...appointments, { ...form, studentName, id: genId("a") }]);
      toast.success("Appointment scheduled");
    }

    setOpen(false);
  };

  const remove = (id: string) => {
    setAppointments(appointments.filter((appointment) => appointment.id !== id));
    toast.success("Appointment deleted");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1>Appointments</h1>
          <p className="text-muted-foreground">Schedule and manage appointments</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="size-4" /> New Appointment
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <CardTitle>All Appointments</CardTitle>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search..." value={search} onChange={(event) => setSearch(event.target.value)} className="w-64 pl-9" />
              </div>
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All Status</SelectItem>
                  <SelectItem value="Scheduled">Scheduled</SelectItem>
                  <SelectItem value="Completed">Completed</SelectItem>
                  <SelectItem value="Cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Doctor</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((appointment) => (
                <TableRow key={appointment.id}>
                  <TableCell>
                    <div>{appointment.studentName}</div>
                    <div className="text-muted-foreground">{appointment.studentId}</div>
                  </TableCell>
                  <TableCell>{appointment.date}</TableCell>
                  <TableCell>{appointment.time}</TableCell>
                  <TableCell>{appointment.doctor}</TableCell>
                  <TableCell>{appointment.reason}</TableCell>
                  <TableCell>
                    <Badge variant={appointment.status === "Completed" ? "secondary" : appointment.status === "Cancelled" ? "destructive" : "default"}>{appointment.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(appointment)}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(appointment.id)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    No appointments found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit" : "New"} Appointment</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Student</Label>
              <Select value={form.studentId} onValueChange={(value) => setForm({ ...form, studentId: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select student" />
                </SelectTrigger>
                <SelectContent>
                  {students.map((student) => (
                    <SelectItem key={student.id} value={student.studentId}>
                      {student.name} ({student.studentId})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} />
            </div>
            <div>
              <Label>Time</Label>
              <Input type="time" value={form.time} onChange={(event) => setForm({ ...form, time: event.target.value })} />
            </div>
            <div>
              <Label>Doctor</Label>
              <Input value={form.doctor} onChange={(event) => setForm({ ...form, doctor: event.target.value })} placeholder="Dr. ..." />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(value) => setForm({ ...form, status: value as Appointment["status"] })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Scheduled">Scheduled</SelectItem>
                  <SelectItem value="Completed">Completed</SelectItem>
                  <SelectItem value="Cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Reason</Label>
              <Input value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}