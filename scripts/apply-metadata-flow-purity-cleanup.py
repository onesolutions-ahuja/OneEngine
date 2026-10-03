from pathlib import Path
import re
import json

workflow_path = Path("server/services/platformWorkflow.js")
init_path = Path("server/database/init.js")
package_path = Path("server/services/packageRegistry.js")

obsolete_keys = [
    "APPOINTMENT_SESSION_CONTEXT",
    "PROCESS_APPOINTMENT_DATE_RESPONSE",
    "PROCESS_APPOINTMENT_SLOT_RESPONSE",
    "PROCESS_APPOINTMENT_CONVERSATION",
    "SEND_APPOINTMENT_CONVERSATION_REPLY",
    "FIND_APPOINTMENT_SLOTS",
    "HOLD_APPOINTMENT_SLOT",
    "RELEASE_APPOINTMENT_SLOT",
    "LIST_APPOINTMENT_PAYMENT_PROVIDERS",
    "CREATE_APPOINTMENT_PAYMENT_REQUEST",
    "CALCULATE_APPOINTMENT_PAYMENT",
    "CONFIRM_APPOINTMENT",
]

def scan_match(text, start, open_char, close_char):
    depth = 0
    state = "code"
    quote = None
    i = start
    template_quote = chr(96)
    while i < len(text):
        c = text[i]
        n = text[i + 1] if i + 1 < len(text) else ""
        if state == "line":
            if c == "\n":
                state = "code"
            i += 1
            continue
        if state == "block":
            if c == "*" and n == "/":
                state = "code"
                i += 2
                continue
            i += 1
            continue
        if state == "string":
            if c == "\\":
                i += 2
                continue
            if c == quote:
                state = "code"
                quote = None
            i += 1
            continue
        if state == "template":
            if c == "\\":
                i += 2
                continue
            if c == template_quote:
                state = "code"
            i += 1
            continue
        if c == "/" and n == "/":
            state = "line"
            i += 2
            continue
        if c == "/" and n == "*":
            state = "block"
            i += 2
            continue
        if c in ("'", '"'):
            state = "string"
            quote = c
            i += 1
            continue
        if c == template_quote:
            state = "template"
            i += 1
            continue
        if c == open_char:
            depth += 1
        elif c == close_char:
            depth -= 1
            if depth == 0:
                return i
        i += 1
    raise RuntimeError("Unmatched delimiter at index %s" % start)

def remove_function(text, name):
    match = re.search(r"(?:async\s+)?function\s+" + re.escape(name) + r"\s*\(", text)
    if not match:
        return text
    params_start = text.find("(", match.start())
    params_end = scan_match(text, params_start, "(", ")")
    body_start = text.find("{", params_end)
    body_end = scan_match(text, body_start, "{", "}")
    end = body_end + 1
    while end < len(text) and text[end] in "\r\n":
        end += 1
    return text[:match.start()] + text[end:]

def remove_registry_entry(text, key):
    marker = 'key: "' + key + '"'
    key_index = text.find(marker)
    if key_index < 0:
        return text
    open_index = key_index
    while open_index >= 0 and text[open_index] != "{":
        open_index -= 1
    if open_index < 0:
        raise RuntimeError("Could not find registry object for " + key)
    close_index = scan_match(text, open_index, "{", "}")
    start = open_index
    while start > 0 and text[start - 1] in " \t":
        start -= 1
    if start > 0 and text[start - 1] == "\n":
        start -= 1
    end = close_index + 1
    while end < len(text) and text[end] in " \t":
        end += 1
    if end < len(text) and text[end] == ",":
        end += 1
    if end < len(text) and text[end] == "\r":
        end += 1
    if end < len(text) and text[end] == "\n":
        end += 1
    return text[:start] + text[end:]

workflow = workflow_path.read_text()

for name in [
    "appointmentOpenCase",
    "prepareAppointmentSession",
    "processAppointmentDateResponse",
    "processAppointmentSlotResponse",
    "appointmentPhoneDigits",
    "appointmentFormatDate",
    "appointmentFormatTime",
    "appointmentDateOptions",
    "appointmentParseDateInput",
]:
    workflow = remove_function(workflow, name)

for key in obsolete_keys:
    workflow = remove_registry_entry(workflow, key)

workflow = re.sub(
    r'"APPOINTMENT_SESSION_CONTEXT","PROCESS_APPOINTMENT_DATE_RESPONSE","PROCESS_APPOINTMENT_SLOT_RESPONSE",\s*\n',
    "",
    workflow,
)

for name in [
    "findAvailableAppointmentSlots",
    "holdAppointmentSlot",
    "releaseAppointmentHold",
    "confirmAppointmentFromHold",
    "listPaymentRequestProviders",
    "createAppointmentPaymentRequest",
    "calculateAppointmentPayment",
]:
    workflow = re.sub(r"\s*" + re.escape(name) + r",\n", "", workflow, count=1)

for key in obsolete_keys:
    if 'key: "' + key + '"' in workflow:
        raise RuntimeError("Obsolete action still registered: " + key)

workflow_path.write_text(workflow)

init = init_path.read_text()
migration_key = 'key: "0043_remove_obsolete_appointment_system_actions"'
if migration_key not in init:
    marker = "  ]);"
    insert_at = init.rfind(marker)
    if insert_at < 0:
        raise RuntimeError("Migration list terminator not found")
    obsolete_json = json.dumps(obsolete_keys)
    migration = '''
    {
      key: "0043_remove_obsolete_appointment_system_actions",
      version: "43",
      name: "Remove obsolete appointment action wrappers from persisted workflow metadata",
      up: async client => {
        const obsolete = %s;
        const systemKeys = obsolete.map((key) => "action:" + key);
        await client.query(
          "DELETE FROM platform_rules WHERE action->>'systemGenerated'='true' AND action->>'systemKey'=ANY($1::text[])",
          [systemKeys]
        );
        await client.query(
          "UPDATE platform_rules SET active=FALSE,lifecycle_status='INACTIVE',updated_at=NOW() " +
          "WHERE active=TRUE AND action->>'type'='workflow' AND EXISTS (" +
          "SELECT 1 FROM jsonb_array_elements(COALESCE(action->'actions','[]'::jsonb)) step " +
          "WHERE step->>'key'=ANY($1::text[]))",
          [obsolete]
        );
        console.log("onePOS: obsolete appointment action wrappers removed from persisted workflow metadata");
      },
    },
''' % obsolete_json
    init = init[:insert_at] + migration + init[insert_at:]
    init_path.write_text(init)

package = package_path.read_text()
package = package.replace(
    'key:"SET_VARIABLE", variable:"selectedDate", value:',
    'key:"ASSIGNMENT", variableName:"selectedDate", variableType:"date", operator:"set", value:'
)
package = package.replace(
    'key:"SET_VARIABLE",variable:"selectedSlot",value:',
    'key:"ASSIGNMENT",variableName:"selectedSlot",variableType:"record",operator:"set",value:'
)
if 'key:"SET_VARIABLE"' in package:
    raise RuntimeError("OneAssistant package still contains non-executable SET_VARIABLE nodes")
package_path.write_text(package)

print("Applied obsolete appointment wrapper cleanup.")

