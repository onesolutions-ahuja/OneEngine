import { useEffect, useMemo, useState } from 'react'

export function useClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30000)
    return () => window.clearInterval(id)
  }, [])
  return now
}

export function MenuBarClock() {
  const now = useClock()
  const dateTime = useMemo(() => new Intl.DateTimeFormat('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(now), [now])
  return <button type="button" className="menubar-time-button">{dateTime}</button>
}
