"use client";

import { useState } from "react";
import { Bell, Calendar, ClipboardList, FileText, LayoutDashboard, Pill, Stethoscope, Users } from "lucide-react";
import { Toaster } from "./ui/sonner";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { useDataStore } from "./data-store";
import { Appointments } from "./Appointments";
import { Dashboard } from "./Dashboard";
import { Inventory } from "./Inventory";
import { Prescriptions } from "./Prescriptions";
import { Reports } from "./Reports";
import { Students } from "./Students";

type View = "dashboard" | "appointments" | "students" | "prescriptions" | "reports" | "inventory";

const navItems: { id: View; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "appointments", label: "Appointments", icon: Calendar },
  { id: "students", label: "Student Records", icon: Users },
  { id: "prescriptions", label: "Prescriptions", icon: ClipboardList },
  { id: "reports", label: "Medical Reports", icon: FileText },
  { id: "inventory", label: "Drug Inventory", icon: Pill },
];

export default function App() {
  const [view, setView] = useState<View>("dashboard");
  const store = useDataStore();

  const lowStock = store.drugs.filter((drug) => drug.stock <= drug.reorderLevel).length;
  const expiring = store.drugs.filter((drug) => (new Date(drug.expiryDate).getTime() - Date.now()) / 86400000 <= 30).length;
  const alerts = lowStock + expiring;

  return (
    <div className="flex size-full bg-slate-50">
      <aside className="flex w-64 flex-col border-r bg-white">
        <div className="flex items-center gap-3 border-b p-6">
          <div className="flex size-10 items-center justify-center rounded-lg bg-[#1D5B5E] text-white">
            <Stethoscope className="size-5" />
          </div>
          <div>
            <p className="font-medium">UniMed</p>
            <p className="text-muted-foreground">Staff Portal</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors ${active ? "bg-[#1D5B5E] text-white" : "text-slate-700 hover:bg-slate-100"}`}
              >
                <Icon className="size-4" />
                <span>{item.label}</span>
                {item.id === "inventory" && alerts > 0 && (
                  <Badge variant="destructive" className="ml-auto">
                    {alerts}
                  </Badge>
                )}
              </button>
            );
          })}
        </nav>

        <div className="border-t p-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-full bg-slate-200">DR</div>
            <div>
              <p className="font-medium">Dr. Priyan</p>
              <p className="text-muted-foreground">Medical Officer</p>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-8 py-4">
          <p className="capitalize text-muted-foreground">{view.replace(/([A-Z])/g, " $1")}</p>
          <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
            <Bell className="size-5" />
            {alerts > 0 && <span className="absolute right-1 top-1 size-2 rounded-full bg-red-500" />}
          </Button>
        </header>

        <div className="p-8">
          {view === "dashboard" && <Dashboard store={store} />}
          {view === "appointments" && <Appointments store={store} />}
          {view === "students" && <Students store={store} />}
          {view === "prescriptions" && <Prescriptions store={store} />}
          {view === "reports" && <Reports store={store} />}
          {view === "inventory" && <Inventory store={store} />}
        </div>
      </main>

      <Toaster />
    </div>
  );
}