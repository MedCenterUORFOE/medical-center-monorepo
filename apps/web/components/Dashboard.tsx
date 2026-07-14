"use client";

import { AlertTriangle, Activity, Calendar, FileText, Pill, Users } from "lucide-react";
import { Bar, BarChart, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { DataStore } from "./data-store";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";

export function Dashboard({ store }: { store: DataStore }) {
  const { students, appointments, drugs, reports } = store;
  const today = new Date().toISOString().slice(0, 10);
  const todayAppts = appointments.filter((appointment) => appointment.date === today);
  const lowStock = drugs.filter((drug) => drug.stock <= drug.reorderLevel);
  const expiring = drugs.filter((drug) => (new Date(drug.expiryDate).getTime() - Date.now()) / 86400000 <= 30);

  const stats = [
    { label: "Total Students", value: students.length, icon: Users, color: "text-blue-600 bg-blue-100" },
    { label: "Today's Appointments", value: todayAppts.length, icon: Calendar, color: "text-green-600 bg-green-100" },
    { label: "Drugs in Inventory", value: drugs.length, icon: Pill, color: "text-purple-600 bg-purple-100" },
    { label: "Reports Issued", value: reports.length, icon: FileText, color: "text-orange-600 bg-orange-100" },
  ];

  const apptByStatus = [
    { name: "Scheduled", value: appointments.filter((appointment) => appointment.status === "Scheduled").length },
    { name: "Completed", value: appointments.filter((appointment) => appointment.status === "Completed").length },
    { name: "Cancelled", value: appointments.filter((appointment) => appointment.status === "Cancelled").length },
  ];
  const colors = ["#3b82f6", "#10b981", "#ef4444"];

  const drugByCategory = Object.entries(
    drugs.reduce<Record<string, number>>((accumulator, drug) => {
      accumulator[drug.category] = (accumulator[drug.category] || 0) + drug.stock;
      return accumulator;
    }, {}),
  ).map(([name, stock]) => ({ name, stock }));

  return (
    <div className="space-y-6">
      <div>
        <h1>Dashboard</h1>
        <p className="text-muted-foreground">Overview of medical center operations</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-muted-foreground">{stat.label}</p>
                    <p className="mt-2">{stat.value}</p>
                  </div>
                  <div className={`rounded-lg p-3 ${stat.color}`}>
                    <Icon className="size-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {(lowStock.length > 0 || expiring.length > 0) && (
        <Card className="border-amber-300 bg-amber-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-amber-600" />
              Inventory Alerts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {lowStock.length > 0 && (
              <div>
                <p className="mb-2">Low Stock ({lowStock.length})</p>
                <div className="flex flex-wrap gap-2">
                  {lowStock.map((drug) => (
                    <Badge key={drug.id} variant="destructive">
                      {drug.name} — {drug.stock} {drug.unit}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {expiring.length > 0 && (
              <div>
                <p className="mb-2">Expiring Soon ({expiring.length})</p>
                <div className="flex flex-wrap gap-2">
                  {expiring.map((drug) => (
                    <Badge key={drug.id} className="bg-orange-500">
                      {drug.name} — exp {drug.expiryDate}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Drug Stock by Category</CardTitle>
            <CardDescription>Total units in inventory</CardDescription>
          </CardHeader>
          <CardContent style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={drugByCategory}>
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="stock" fill="#3b82f6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Appointments by Status</CardTitle>
            <CardDescription>All-time breakdown</CardDescription>
          </CardHeader>
          <CardContent style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={apptByStatus} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90}>
                  {apptByStatus.map((_, index) => (
                    <Cell key={index} fill={colors[index]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="size-5" /> Today&apos;s Schedule
          </CardTitle>
        </CardHeader>
        <CardContent>
          {todayAppts.length === 0 ? (
            <p className="text-muted-foreground">No appointments scheduled for today.</p>
          ) : (
            <div className="space-y-2">
              {todayAppts.map((appointment) => (
                <div key={appointment.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p>
                      {appointment.studentName} <span className="text-muted-foreground">({appointment.studentId})</span>
                    </p>
                    <p className="text-muted-foreground">
                      {appointment.time} • {appointment.doctor} • {appointment.reason}
                    </p>
                  </div>
                  <Badge variant={appointment.status === "Completed" ? "secondary" : "default"}>{appointment.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}