"use client";

import { useState } from "react";
import { AlertTriangle, Clock, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import type { Drug } from "./types";
import type { DataStore } from "./data-store";
import { genId } from "./data-store";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";

const empty: Omit<Drug, "id"> = { name: "", category: "", stock: 0, unit: "tablets", expiryDate: "", reorderLevel: 0 };

export function Inventory({ store }: { store: DataStore }) {
  const { drugs, setDrugs } = store;
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Drug | null>(null);
  const [form, setForm] = useState(empty);
  const [search, setSearch] = useState("");

  const filtered = drugs.filter((drug) => `${drug.name} ${drug.category}`.toLowerCase().includes(search.toLowerCase()));
  const lowStock = drugs.filter((drug) => drug.stock <= drug.reorderLevel);
  const expiring = drugs.filter((drug) => {
    const days = (new Date(drug.expiryDate).getTime() - Date.now()) / 86400000;
    return days <= 30 && days >= 0;
  });
  const expired = drugs.filter((drug) => new Date(drug.expiryDate).getTime() < Date.now());

  const openNew = () => {
    setEditing(null);
    setForm(empty);
    setOpen(true);
  };

  const openEdit = (drug: Drug) => {
    setEditing(drug);
    setForm(drug);
    setOpen(true);
  };

  const save = () => {
    if (!form.name) {
      toast.error("Drug name required");
      return;
    }

    if (editing) {
      setDrugs(drugs.map((drug) => (drug.id === editing.id ? { ...form, id: editing.id } : drug)));
      toast.success("Drug updated");
    } else {
      setDrugs([...drugs, { ...form, id: genId("d") }]);
      toast.success("Drug added");
    }

    setOpen(false);
  };

  const remove = (id: string) => {
    setDrugs(drugs.filter((drug) => drug.id !== id));
    toast.success("Drug deleted");
  };

  const renderTable = (rows: Drug[]) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Stock</TableHead>
          <TableHead>Reorder Level</TableHead>
          <TableHead>Expiry</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((drug) => {
          const isLow = drug.stock <= drug.reorderLevel;
          const days = Math.floor((new Date(drug.expiryDate).getTime() - Date.now()) / 86400000);
          const isExpired = days < 0;
          const isExpiring = days >= 0 && days <= 30;

          return (
            <TableRow key={drug.id}>
              <TableCell>{drug.name}</TableCell>
              <TableCell>{drug.category}</TableCell>
              <TableCell>
                {drug.stock} {drug.unit}
              </TableCell>
              <TableCell>{drug.reorderLevel}</TableCell>
              <TableCell>{drug.expiryDate}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {isLow && <Badge variant="destructive">Low Stock</Badge>}
                  {isExpired && <Badge variant="destructive">Expired</Badge>}
                  {isExpiring && <Badge className="bg-orange-500">Expiring ({days}d)</Badge>}
                  {!isLow && !isExpired && !isExpiring && <Badge variant="secondary">OK</Badge>}
                </div>
              </TableCell>
              <TableCell className="text-right">
                <Button variant="ghost" size="icon" onClick={() => openEdit(drug)}>
                  <Pencil className="size-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => remove(drug.id)}>
                  <Trash2 className="size-4" />
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
        {rows.length === 0 && (
          <TableRow>
            <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
              No items
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1>Drug Inventory</h1>
          <p className="text-muted-foreground">Manage stock, expiry and reorder levels</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="size-4" /> Add Drug
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="border-red-200">
          <CardContent className="flex items-center justify-between pt-6">
            <div>
              <p className="text-muted-foreground">Low Stock</p>
              <p className="text-2xl font-semibold">{lowStock.length}</p>
            </div>
            <AlertTriangle className="size-8 text-red-500" />
          </CardContent>
        </Card>
        <Card className="border-orange-200">
          <CardContent className="flex items-center justify-between pt-6">
            <div>
              <p className="text-muted-foreground">Expiring (≤30d)</p>
              <p className="text-2xl font-semibold">{expiring.length}</p>
            </div>
            <Clock className="size-8 text-orange-500" />
          </CardContent>
        </Card>
        <Card className="border-red-300">
          <CardContent className="flex items-center justify-between pt-6">
            <div>
              <p className="text-muted-foreground">Expired</p>
              <p className="text-2xl font-semibold">{expired.length}</p>
            </div>
            <AlertTriangle className="size-8 text-red-700" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Inventory</CardTitle>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search..." value={search} onChange={(event) => setSearch(event.target.value)} className="w-64 pl-9" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="all">
            <TabsList>
              <TabsTrigger value="all">All ({filtered.length})</TabsTrigger>
              <TabsTrigger value="low">Low Stock ({lowStock.length})</TabsTrigger>
              <TabsTrigger value="exp">Expiring ({expiring.length + expired.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="all">{renderTable(filtered)}</TabsContent>
            <TabsContent value="low">{renderTable(lowStock)}</TabsContent>
            <TabsContent value="exp">{renderTable([...expired, ...expiring])}</TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit" : "Add"} Drug</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Name</Label>
              <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </div>
            <div>
              <Label>Category</Label>
              <Input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} />
            </div>
            <div>
              <Label>Unit</Label>
              <Input value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} />
            </div>
            <div>
              <Label>Stock</Label>
              <Input type="number" value={form.stock} onChange={(event) => setForm({ ...form, stock: Number(event.target.value) })} />
            </div>
            <div>
              <Label>Reorder Level</Label>
              <Input type="number" value={form.reorderLevel} onChange={(event) => setForm({ ...form, reorderLevel: Number(event.target.value) })} />
            </div>
            <div className="col-span-2">
              <Label>Expiry Date</Label>
              <Input type="date" value={form.expiryDate} onChange={(event) => setForm({ ...form, expiryDate: event.target.value })} />
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