import { oneAssistantAppointmentRouterWorkflow } from "./workflows.js";

export function oneAssistantManifest() {
  return {
        objects: [
          {
            objectKey: "appointment_service",
            metadataScope: "global",
            label: "Appointment Service",
            pluralLabel: "Appointment Services",
            description: "Bookable service used by OneAssistant availability and appointment workflows.",
            sourceTable: "appointment_services",
            fields: [
              { apiName: "name", label: "Name", fieldType: "text", sourceColumn: "name", writable: true, required: true },
              { apiName: "description", label: "Description", fieldType: "text", sourceColumn: "description", writable: true },
              { apiName: "duration_minutes", label: "Duration Minutes", fieldType: "number", sourceColumn: "duration_minutes", writable: true, required: true },
              { apiName: "price", label: "Price", fieldType: "number", sourceColumn: "price", writable: true },
              { apiName: "currency", label: "Currency", fieldType: "text", sourceColumn: "currency", writable: true },
              { apiName: "active", label: "Active", fieldType: "boolean", sourceColumn: "active", writable: true },
              { apiName: "created_at", label: "Created", fieldType: "datetime", sourceColumn: "created_at", writable: false }
            ],
          },
          {
            objectKey: "appointment_resource",
            metadataScope: "global",
            label: "Appointment Resource",
            pluralLabel: "Appointment Resources",
            description: "Staff or resource that can fulfil an appointment.",
            sourceTable: "appointment_resources",
            fields: [
              { apiName: "name", label: "Name", fieldType: "text", sourceColumn: "name", writable: true, required: true },
              { apiName: "resource_type", label: "Resource Type", fieldType: "text", sourceColumn: "resource_type", writable: true },
              { apiName: "timezone", label: "Timezone", fieldType: "text", sourceColumn: "timezone", writable: true },
              { apiName: "active", label: "Active", fieldType: "boolean", sourceColumn: "active", writable: true },
              { apiName: "created_at", label: "Created", fieldType: "datetime", sourceColumn: "created_at", writable: false }
            ],
          },
          {
            objectKey: "appointment_availability_rule",
            metadataScope: "global",
            label: "Appointment Availability Rule",
            pluralLabel: "Appointment Availability Rules",
            description: "Metadata-visible working hours used by booking flows.",
            sourceTable: "appointment_availability_rules",
            fields: [
              { apiName: "resource_id", label: "Resource", fieldType: "lookup", sourceColumn: "resource_id", writable: true, required: true, config: { relatedObjectKey: "appointment_resource" } },
              { apiName: "weekday", label: "Weekday", fieldType: "number", sourceColumn: "weekday", writable: true, required: true },
              { apiName: "start_time", label: "Start Time", fieldType: "text", sourceColumn: "start_time", writable: true, required: true },
              { apiName: "end_time", label: "End Time", fieldType: "text", sourceColumn: "end_time", writable: true, required: true },
              { apiName: "slot_interval_minutes", label: "Slot Interval Minutes", fieldType: "number", sourceColumn: "slot_interval_minutes", writable: true },
              { apiName: "active", label: "Active", fieldType: "boolean", sourceColumn: "active", writable: true }
            ],
          },
          {
            objectKey: "appointment_resource_service",
            metadataScope: "global",
            label: "Appointment Resource Service",
            pluralLabel: "Appointment Resource Services",
            description: "Metadata-visible assignment between bookable services and resources.",
            sourceTable: "appointment_resource_services",
            fields: [
              { apiName: "resource_id", label: "Resource", fieldType: "lookup", sourceColumn: "resource_id", writable: true, required: true, config: { relatedObjectKey: "appointment_resource" } },
              { apiName: "service_id", label: "Service", fieldType: "lookup", sourceColumn: "service_id", writable: true, required: true, config: { relatedObjectKey: "appointment_service" } },
              { apiName: "duration_minutes", label: "Duration Minutes", fieldType: "number", sourceColumn: "duration_minutes", writable: true },
              { apiName: "active", label: "Active", fieldType: "boolean", sourceColumn: "active", writable: true }
            ],
          },
          {
            objectKey: "appointment_slot_hold",
            metadataScope: "global",
            label: "Appointment Slot Hold",
            pluralLabel: "Appointment Slot Holds",
            description: "Temporary slot reservations visible to Flow availability logic.",
            sourceTable: "appointment_slot_holds",
            fields: [
              { apiName: "service_id", label: "Service", fieldType: "lookup", sourceColumn: "service_id", writable: false, config: { relatedObjectKey: "appointment_service" } },
              { apiName: "resource_id", label: "Resource", fieldType: "lookup", sourceColumn: "resource_id", writable: false, config: { relatedObjectKey: "appointment_resource" } },
              { apiName: "starts_at", label: "Starts At", fieldType: "datetime", sourceColumn: "starts_at", writable: false },
              { apiName: "ends_at", label: "Ends At", fieldType: "datetime", sourceColumn: "ends_at", writable: false },
              { apiName: "expires_at", label: "Expires At", fieldType: "datetime", sourceColumn: "expires_at", writable: false },
              { apiName: "status", label: "Status", fieldType: "picklist", sourceColumn: "status", writable: false, options: ["ACTIVE","CONSUMED","RELEASED","EXPIRED"] }
            ],
          },
          {
            objectKey: "appointment",
            metadataScope: "global",
            label: "Appointment",
            pluralLabel: "Appointments",
            description: "Canonical appointment record. Workflow builders can create, query and update these records directly.",
            sourceTable: "appointments",
            fields: [
              { apiName: "store_id", label: "Store", fieldType: "lookup", sourceColumn: "store_id", writable: true },
              { apiName: "service_id", label: "Service", fieldType: "lookup", sourceColumn: "service_id", writable: true, required: true, config: { relatedObjectKey: "appointment_service" } },
              { apiName: "resource_id", label: "Resource", fieldType: "lookup", sourceColumn: "resource_id", writable: true, required: true, config: { relatedObjectKey: "appointment_resource" } },
              { apiName: "customer_id", label: "Customer", fieldType: "lookup", sourceColumn: "customer_id", writable: true },
              { apiName: "customer_name", label: "Customer Name", fieldType: "text", sourceColumn: "customer_name", writable: true },
              { apiName: "customer_phone", label: "Customer Phone", fieldType: "text", sourceColumn: "customer_phone", writable: true },
              { apiName: "customer_email", label: "Customer Email", fieldType: "text", sourceColumn: "customer_email", writable: true },
              { apiName: "starts_at", label: "Starts At", fieldType: "datetime", sourceColumn: "starts_at", writable: true, required: true },
              { apiName: "ends_at", label: "Ends At", fieldType: "datetime", sourceColumn: "ends_at", writable: true, required: true },
              { apiName: "status", label: "Status", fieldType: "picklist", sourceColumn: "status", writable: true, options: ["TENTATIVE","AWAITING_PAYMENT","CONFIRMED","CHECKED_IN","COMPLETED","CANCELLED","NO_SHOW"] },
              { apiName: "source_channel", label: "Source Channel", fieldType: "text", sourceColumn: "source_channel", writable: true },
              { apiName: "notes", label: "Notes", fieldType: "text", sourceColumn: "notes", writable: true },
              { apiName: "payment_status", label: "Payment Status", fieldType: "text", sourceColumn: "payment_status", writable: true },
              { apiName: "created_at", label: "Created", fieldType: "datetime", sourceColumn: "created_at", writable: false }
            ],
          },
          {
            objectKey: "appointment_booking_case",
            metadataScope: "global",
            label: "Appointment Booking Case",
            pluralLabel: "Appointment Booking Cases",
            description: "Channel-neutral booking case created from Email, SMS, WhatsApp or web booking.",
            sourceTable: "appointment_booking_cases",
            fields: [
              { apiName: "state", label: "Conversation State", fieldType: "json", sourceColumn: "state", writable: true },
              { apiName: "customer_id", label: "Customer", fieldType: "lookup", sourceColumn: "customer_id", writable: true, config: { relatedObjectKey: "customer" } },
              { apiName: "channel", label: "Channel", fieldType: "picklist", sourceColumn: "channel", writable: true, options: ["EMAIL","SMS","WHATSAPP","WEB"] },
              { apiName: "sender", label: "Sender", fieldType: "text", sourceColumn: "sender", writable: true },
              { apiName: "recipient", label: "Recipient", fieldType: "text", sourceColumn: "recipient", writable: true },
              { apiName: "subject", label: "Subject", fieldType: "text", sourceColumn: "subject", writable: true },
              { apiName: "body", label: "Message", fieldType: "text", sourceColumn: "body", writable: true },
              { apiName: "status", label: "Status", fieldType: "picklist", sourceColumn: "status", writable: true, options: ["NEW","LINK_SENT","SLOT_SELECTED","AWAITING_PAYMENT","CONFIRMED","CANCELLED","EXPIRED"] },
              { apiName: "service_id", label: "Service", fieldType: "lookup", sourceColumn: "service_id", writable: true, config: { relatedObjectKey: "appointment_service" } },
              { apiName: "appointment_id", label: "Appointment", fieldType: "lookup", sourceColumn: "appointment_id", writable: true, config: { relatedObjectKey: "appointment" } },
              { apiName: "payment_request_id", label: "Payment Request", fieldType: "lookup", sourceColumn: "payment_request_id", writable: false },
              { apiName: "created_at", label: "Created", fieldType: "datetime", sourceColumn: "created_at", writable: false }
            ],
          },
        ],
        listViews: [
          { objectKey: "appointment_booking_case", viewKey: "recent", label: "Recent Booking Cases", columns: ["channel","sender","status","service_id","appointment_id","created_at"], sort: { field: "created_at", direction: "desc" }, pageSize: 50, isDefault: true }
        ],
        workflows: [
          oneAssistantAppointmentRouterWorkflow(),
          {
            objectKey: "appointment_booking_case",
            name: "OneAssistant - Payment Router",
            triggerKey: "appointment_payment_required",
            conditions: [],
            action: {
              type: "workflow",
              scope: "one_assistant",
              subflowCapability: "assistant.payment.router",
              actions: [
                { id: "payment_provider", key: "RUN_ASSISTANT_SUBFLOW", capability: "assistant.payment", required: false }
              ]
            },
            active: false,
          },
          {
            objectKey: "appointment_booking_case",
            name: "OneAssistant - Confirmation Router",
            triggerKey: "appointment_confirmed",
            conditions: [],
            action: {
              type: "workflow",
              scope: "one_assistant",
              subflowCapability: "assistant.confirmation",
              actions: [
                { id: "confirmation_channel", key: "RUN_ASSISTANT_SUBFLOW", capability: "assistant.confirmation", channel: { path: "channel" }, required: false }
              ]
            },
            active: false,
          }
        ],
        templates: [
          { apiKey: "assistant_email_booking_link", name: "OneAssistant Email - Booking Link", channel: "EMAIL", subject: "Choose your appointment time", body: "We received your appointment request. Choose an available time here: {{bookingUrl}}", required: false },
          { apiKey: "assistant_email_payment", name: "OneAssistant Email - Payment", channel: "EMAIL", subject: "Complete your appointment payment", body: "Your appointment slot is reserved temporarily. Complete payment here: {{paymentUrl}}", required: false },
          { apiKey: "assistant_email_confirmation", name: "OneAssistant Email - Confirmation", channel: "EMAIL", subject: "Your appointment is confirmed", body: "Your appointment is confirmed for {{appointmentStartsAt}}. {{invoiceUrl}}", required: false },
          { apiKey: "assistant_sms_booking_link", name: "OneAssistant SMS - Booking Link", channel: "SMS", body: "Choose your appointment time: {{bookingUrl}}", required: false },
          { apiKey: "assistant_sms_payment", name: "OneAssistant SMS - Payment", channel: "SMS", body: "Complete payment to confirm your appointment: {{paymentUrl}}", required: false },
          { apiKey: "assistant_sms_confirmation", name: "OneAssistant SMS - Confirmation", channel: "SMS", body: "Your appointment is confirmed for {{appointmentStartsAt}}.", required: false },
          { apiKey: "assistant_whatsapp_booking_link", name: "OneAssistant WhatsApp - Booking Link", channel: "WHATSAPP", body: "Choose your appointment time: {{bookingUrl}}", required: false },
          { apiKey: "assistant_whatsapp_payment", name: "OneAssistant WhatsApp - Payment", channel: "WHATSAPP", body: "Complete payment to confirm your appointment: {{paymentUrl}}", required: false },
          { apiKey: "assistant_whatsapp_confirmation", name: "OneAssistant WhatsApp - Confirmation", channel: "WHATSAPP", body: "Your appointment is confirmed for {{appointmentStartsAt}}.", required: false }
        ],
      };
}
