"use client";

import { useState } from "react";
import { Eye, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import type { Student } from "./types";
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
import { Textarea } from "./ui/textarea";

const empty: Omit<Student, "id"> = {
  studentId: "",
  name: "",
  age: 18,
  gender: "Male",
  bloodGroup: "",
  phone: "",
  email: "",
  allergies: "",
  conditions: "",
  notes: "",
};

export function Students({ store }: { store: DataStore }) {
  const { students, setStudents } = store;
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState<Student | null>(null);
  const [editing, setEditing] = useState<Student | null>(null);
  const [form, setForm] = useState(empty);
  const [search, setSearch] = useState("");

  const filtered = students.filter((student) => `${student.name} ${student.studentId} ${student.email}`.toLowerCase().includes(search.toLowerCase()));

  const openNew = () => {
    setEditing(null);
    setForm(empty);
    setOpen(true);
  };

  const openEdit = (student: Student) => {
    setEditing(student);
    setForm(student);
    setOpen(true);
  };

  const save = () => {
    if (!form.studentId || !form.name) {
      toast.error("Student ID and Name required");
      return;
    }

    if (editing) {
      setStudents(students.map((student) => (student.id === editing.id ? { ...form, id: editing.id } : student)));
      toast.success("Record updated");
    } else {
      setStudents([...students, { ...form, id: genId("s") }]);
      toast.success("Record created");
    }

    setOpen(false);
  };

  const remove = (id: string) => {
    setStudents(students.filter((student) => student.id !== id));
    toast.success("Record deleted");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1>Student Medical Records</h1>
          <p className="text-muted-foreground">Manage student health profiles</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="size-4" /> Add Student
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>All Records ({filtered.length})</CardTitle>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search..." value={search} onChange={(event) => setSearch(event.target.value)} className="w-64 pl-9" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Age</TableHead>
                <TableHead>Gender</TableHead>
                <TableHead>Blood</TableHead>
                <TableHead>Allergies</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((student) => (
                <TableRow key={student.id}>
                  <TableCell>{student.studentId}</TableCell>
                  <TableCell>{student.name}</TableCell>
                  <TableCell>{student.age}</TableCell>
                  <TableCell>{student.gender}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{student.bloodGroup}</Badge>
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate">{student.allergies || "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => setViewing(student)}>
                      <Eye className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(student)}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(student.id)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    No records found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit" : "Add"} Student Record</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Student ID</Label>
              <Input value={form.studentId} onChange={(event) => setForm({ ...form, studentId: event.target.value })} />
            </div>
            <div>
              <Label>Full Name</Label>
              <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </div>
            <div>
              <Label>Age</Label>
              <Input type="number" value={form.age} onChange={(event) => setForm({ ...form, age: Number(event.target.value) })} />
            </div>
            <div>
              <Label>Gender</Label>
              <Select value={form.gender} onValueChange={(value) => setForm({ ...form, gender: value as Student["gender"] })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Male">Male</SelectItem>
                  <SelectItem value="Female">Female</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Blood Group</Label>
              <Input value={form.bloodGroup} onChange={(event) => setForm({ ...form, bloodGroup: event.target.value })} />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
            </div>
            <div className="col-span-2">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
            </div>
            <div className="col-span-2">
              <Label>Allergies</Label>
              <Input value={form.allergies} onChange={(event) => setForm({ ...form, allergies: event.target.value })} />
            </div>
            <div className="col-span-2">
              <Label>Chronic Conditions</Label>
              <Input value={form.conditions} onChange={(event) => setForm({ ...form, conditions: event.target.value })} />
            </div>
            <div className="col-span-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
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

      <Dialog open={!!viewing} onOpenChange={(openState) => !openState && setViewing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{viewing?.name}</DialogTitle>
          </DialogHeader>
          {viewing && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground">Student ID</Label>
                <p>{viewing.studentId}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Age / Gender</Label>
                <p>
                  {viewing.age} • {viewing.gender}
                </p>
              </div>
              <div>
                <Label className="text-muted-foreground">Blood Group</Label>
                <p>{viewing.bloodGroup}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Phone</Label>
                <p>{viewing.phone}</p>
              </div>
              <div className="col-span-2">
                <Label className="text-muted-foreground">Email</Label>
                <p>{viewing.email}</p>
              </div>
              <div className="col-span-2">
                <Label className="text-muted-foreground">Allergies</Label>
                <p>{viewing.allergies || "—"}</p>
              </div>
              <div className="col-span-2">
                <Label className="text-muted-foreground">Conditions</Label>
                <p>{viewing.conditions || "—"}</p>
              </div>
              <div className="col-span-2">
                <Label className="text-muted-foreground">Notes</Label>
                <p>{viewing.notes || "—"}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}