"use client";

import { useState } from "react";
import { Eye, Plus, Printer, Trash2 } from "lucide-react";
import { toast } from "sonner";

import type { Prescription } from "./types";
import type { DataStore } from "./data-store";
import { genId } from "./data-store";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Textarea } from "./ui/textarea";

const empty: Omit<Prescription, "id"> = {
  studentId: "",
  studentName: "",
  date: new Date().toISOString().slice(0, 10),
  doctor: "",
  diagnosis: "",
  items: [{ drug: "", dosage: "", duration: "" }],
};

export function Prescriptions({ store }: { store: DataStore }) {
  const { prescriptions, setPrescriptions, students, drugs } = store;
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState<Prescription | null>(null);
  const [form, setForm] = useState(empty);

  const openNew = () => {
    setForm(empty);
    setOpen(true);
  };

  const save = () => {
    if (!form.studentId || !form.diagnosis) {
      toast.error("Student and diagnosis required");
      return;
    }

    const student = students.find((value) => value.studentId === form.studentId);
    setPrescriptions([...prescriptions, { ...form, studentName: student?.name || "", id: genId("p") }]);
    toast.success("Prescription issued");
    setOpen(false);
  };

  const remove = (id: string) => {
    setPrescriptions(prescriptions.filter((prescription) => prescription.id !== id));
    toast.success("Deleted");
  };

  const updateItem = (index: number, field: keyof Prescription["items"][0], value: string) => {
    const items = [...form.items];
    items[index] = { ...items[index], [field]: value };
    setForm({ ...form, items });
  };

  const print = () => window.print();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1>Prescriptions</h1>
          <p className="text-muted-foreground">Issue and review prescriptions</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="size-4" /> New Prescription
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Issued Prescriptions</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Student</TableHead>
                <TableHead>Doctor</TableHead>
                <TableHead>Diagnosis</TableHead>
                <TableHead>Items</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {prescriptions.map((prescription) => (
                <TableRow key={prescription.id}>
                  <TableCell>{prescription.date}</TableCell>
                  <TableCell>{prescription.studentName}</TableCell>
                  <TableCell>{prescription.doctor}</TableCell>
                  <TableCell className="max-w-[260px] truncate">{prescription.diagnosis}</TableCell>
                  <TableCell>{prescription.items.length}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => setViewing(prescription)}>
                      <Eye className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(prescription.id)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {prescriptions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    No prescriptions
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
            <DialogTitle>New Prescription</DialogTitle>
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
              <Label>Doctor</Label>
              <Input value={form.doctor} onChange={(event) => setForm({ ...form, doctor: event.target.value })} />
            </div>
            <div className="col-span-2">
              <Label>Diagnosis</Label>
              <Textarea value={form.diagnosis} onChange={(event) => setForm({ ...form, diagnosis: event.target.value })} />
            </div>
            <div className="col-span-2 space-y-2">
              <div className="flex items-center justify-between">
                <Label>Medications</Label>
                <Button variant="outline" size="sm" onClick={() => setForm({ ...form, items: [...form.items, { drug: "", dosage: "", duration: "" }] })}>
                  Add Item
                </Button>
              </div>
              {form.items.map((item, index) => (
                <div key={index} className="grid grid-cols-3 gap-2">
                  <Select value={item.drug} onValueChange={(value) => updateItem(index, "drug", value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Drug" />
                    </SelectTrigger>
                    <SelectContent>
                      {drugs.map((drug) => (
                        <SelectItem key={drug.id} value={drug.name}>
                          {drug.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input placeholder="Dosage" value={item.dosage} onChange={(event) => updateItem(index, "dosage", event.target.value)} />
                  <Input placeholder="Duration" value={item.duration} onChange={(event) => updateItem(index, "duration", event.target.value)} />
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save}>Issue Prescription</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewing} onOpenChange={(openState) => !openState && setViewing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Prescription</DialogTitle>
          </DialogHeader>
          {viewing && (
            <div className="space-y-4">
              <div className="border-b pb-3">
                <p>
                  {viewing.studentName} <span className="text-muted-foreground">({viewing.studentId})</span>
                </p>
                <p className="text-muted-foreground">
                  {viewing.date} • {viewing.doctor}
                </p>
              </div>
              <div>
                <Label className="text-muted-foreground">Diagnosis</Label>
                <p>{viewing.diagnosis}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Medications</Label>
                <div className="mt-2 space-y-2">
                  {viewing.items.map((item, index) => (
                    <div key={index} className="rounded-lg border p-3">
                      <p>{item.drug}</p>
                      <p className="text-muted-foreground">
                        {item.dosage} • {item.duration}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
              <Button onClick={print} variant="outline">
                <Printer className="size-4" /> Print
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}