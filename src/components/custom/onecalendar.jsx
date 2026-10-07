import React, { useState } from 'react';
import { BasicScheduler } from 'calendarkit-basic';

// Optional: Import stylesheet if required by your setup
// import 'calendarkit-basic/dist/style.css';

export default function AppointmentCalendar() {
  // Initial bookings and appointments state
  const [appointments, setAppointments] = useState([
    {
      id: '1',
      title: 'Client Strategy Meeting',
      start: new Date(2026, 9, 10, 10, 0), // Year, Month (0-indexed, 9 = Oct), Day, Hour, Minute
      end: new Date(2026, 9, 10, 11, 0),
    },
    {
      id: '2',
      title: 'Product Demo',
      start: new Date(2026, 9, 12, 14, 30),
      end: new Date(2026, 9, 12, 15, 30),
    }
  ]);

  // Handle adding a new appointment slot
  const handleCreate = (newEvent) => {
    const formattedEvent = {
      ...newEvent,
      id: Date.now().toString(),
    };
    setAppointments((prev) => [...prev, formattedEvent]);
  };

  // Handle updating an existing appointment
  const handleUpdate = (updatedEvent) => {
    setAppointments((prev) =>
      prev.map((item) => (item.id === updatedEvent.id ? updatedEvent : item))
    );
  };

  // Handle deleting an appointment
  const handleDelete = (eventId) => {
    setAppointments((prev) => prev.filter((item) => item.id !== eventId));
  };

  return (
    <div style={{ height: '700px', width: '100%', padding: '16px', background: '#ffffff' }}>
      <BasicScheduler
        events={appointments}
        onEventCreate={handleCreate}
        onEventUpdate={handleUpdate}
        onEventDelete={handleDelete}
        defaultView="week"
      />
    </div>
  );
}
