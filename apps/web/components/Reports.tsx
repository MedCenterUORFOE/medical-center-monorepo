"use client";

import { useState } from "react";
import { Eye, Plus, Printer, Trash2 } from "lucide-react";
import { toast } from "sonner";

import type { MedicalReport } from "./types";
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

const empty: Omit<MedicalReport, "id"> = {
  studentId: "",
  studentName: "",
  date: new Date().toISOString().slice(0, 10),
  doctor: "",
  title: "",
  findings: "",
  recommendations: "",
};

export function Reports({ store }: { store: DataStore }) {
  const { reports, setReports, students } = store;
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState<MedicalReport | null>(null);
  const [form, setForm] = useState(empty);

  const save = () => {
    if (!form.studentId || !form.title) {
      toast.error("Student and title required");
      return;
    }

    const student = students.find((value) => value.studentId === form.studentId);
    setReports([...reports, { ...form, studentName: student?.name || "", id: genId("r") }]);
    toast.success("Report issued");
    setOpen(false);
  };

  const remove = (id: string) => {
    setReports(reports.filter((report) => report.id !== id));
    toast.success("Deleted");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1>Medical Reports</h1>
          <p className="text-muted-foreground">Issue and review medical reports</p>
        </div>
        <Button
          onClick={() => {
            setForm(empty);
            setOpen(true);
          }}
        >
          <Plus className="size-4" /> New Report
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Issued Reports</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Student</TableHead>
                <TableHead>Doctor</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports.map((report) => (
                <TableRow key={report.id}>
                  <TableCell>{report.date}</TableCell>
                  <TableCell>{report.title}</TableCell>
                  <TableCell>{report.studentName}</TableCell>
                  <TableCell>{report.doctor}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => setViewing(report)}>
                      <Eye className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(report.id)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {reports.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    No reports
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
            <DialogTitle>New Medical Report</DialogTitle>
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
              <Label>Title</Label>
              <Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
            </div>
            <div className="col-span-2">
              <Label>Findings</Label>
              <Textarea rows={4} value={form.findings} onChange={(event) => setForm({ ...form, findings: event.target.value })} />
            </div>
            <div className="col-span-2">
              <Label>Recommendations</Label>
              <Textarea rows={3} value={form.recommendations} onChange={(event) => setForm({ ...form, recommendations: event.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save}>Issue Report</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewing} onOpenChange={(openState) => !openState && setViewing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{viewing?.title}</DialogTitle>
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
                <Label className="text-muted-foreground">Findings</Label>
                <p className="whitespace-pre-wrap">{viewing.findings}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Recommendations</Label>
                <p className="whitespace-pre-wrap">{viewing.recommendations}</p>
              </div>
              <Button onClick={() => window.print()} variant="outline">
                <Printer className="size-4" /> Print
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}