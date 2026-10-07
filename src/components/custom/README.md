# Custom Components

This is the approved source root for metadata-registered Page Builder components.

Each component lives in its own folder and keeps JSX and CSS separate:

```
src/components/custom/
  AdvancedCalendar/
    AdvancedCalendar.jsx
    AdvancedCalendar.css
```

Register the relative paths in **Developer → Components**:

- JSX: `AdvancedCalendar/AdvancedCalendar.jsx`
- CSS: `AdvancedCalendar/AdvancedCalendar.css`
- Enable **Supports data binding** when the component consumes Page Builder record collections.

Do not add component-specific business/object wiring here. Object selection, filters, sorting and record binding belong to Page Builder metadata.
