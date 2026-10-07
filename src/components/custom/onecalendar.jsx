import React, { useState } from 'react';
import './Calendar.css';

export default function SimpleCalendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [appointments, setAppointments] = useState([
    { date: '2026-10-15', title: 'Dentist Appointment' },
    { date: '2026-10-20', title: 'Client Meeting' }
  ]);
  const [newTitle, setNewTitle] = useState('');
  const [selectedDate, setSelectedDate] = useState('');

  // Get days in current month
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDayIndex = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  const handleAddAppointment = (e) => {
    e.preventDefault();
    if (!selectedDate || !newTitle) return;
    setAppointments([...appointments, { date: selectedDate, title: newTitle }]);
    setNewTitle('');
    setSelectedDate('');
  };

  return (
    <div className="calendar-container">
      <div className="calendar-header">
        <button onClick={() => setCurrentDate(new Date(year, month - 1, 1))}>&lt;</button>
        <h2>{monthNames[month]} {year}</h2>
        <button onClick={() => setCurrentDate(new Date(year, month + 1, 1))}>&gt;</button>
      </div>

      <div className="weekdays-grid">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
          <div key={d} className="weekday">{d}</div>
        ))}
      </div>

      <div className="days-grid">
        {Array.from({ length: firstDayIndex }).map((_, i) => (
          <div key={`empty-${i}`} className="day empty"></div>
        ))}
        {Array.from({ length: totalDays }).map((_, i) => {
          const dayNum = i + 1;
          const formattedMonth = String(month + 1).padStart(2, '0');
          const formattedDay = String(dayNum).padStart(2, '0');
          const dateString = `${year}-${formattedMonth}-${formattedDay}`;
          const dayEvents = appointments.filter(app => app.date === dateString);

          return (
            <div 
              key={dayNum} 
              className="day"
              onClick={() => setSelectedDate(dateString)}
            >
              <span className="day-number">{dayNum}</span>
              <div className="events-list">
                {dayEvents.map((ev, idx) => (
                  <span key={idx} className="event-badge" title={ev.title}>
                    {ev.title}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {selectedDate && (
        <form className="appointment-form" onSubmit={handleAddAppointment}>
          <h4>Add Booking for {selectedDate}</h4>
          <input 
            type="text" 
            placeholder="Appointment title..." 
            value={newTitle} 
            onChange={(e) => setNewTitle(e.target.value)} 
            required 
          />
          <button type="submit">Save Booking</button>
          <button type="button" onClick={() => setSelectedDate('')}>Cancel</button>
        </form>
      )}
    </div>
  );
}
