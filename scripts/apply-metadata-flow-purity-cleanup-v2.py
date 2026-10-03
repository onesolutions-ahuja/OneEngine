from pathlib import Path
import re, json

workflow_path = Path("server/services/platformWorkflow.js")
init_path = Path("server/database/init.js")

obsolete = [
    "APPOINTMENT_SESSION_CONTEXT",
    "PROCESS_APPOINTMENT_DATE_RESPONSE",
    "PROCESS_APPOINTMENT_SLOT_RESPONSE",
    "PROCESS_APPOINTMENT_CONVERSATION",
    "SEND_APPOINTMENT_CONVERSATION_REPLY",
    "HOLD_APPOINTMENT_SLOT",
    "RELEASE_APPOINTMENT_SLOT",
    "LIST_APPOINTMENT_PAYMENT_PROVIDERS",
    "CREATE_APPOINTMENT_PAYMENT_REQUEST",
    "CALCULATE_APPOINTMENT_PAYMENT",
    "CONFIRM_APPOINTMENT",
]

def match_close(text, start, op, cl):
    depth=0; state="code"; quote=None; i=start; tick=chr(96)
    while i < len(text):
        c=text[i]; n=text[i+1] if i+1<len(text) else ""
        if state=="line":
            if c=="\n": state="code"
            i+=1; continue
        if state=="block":
            if c=="*" and n=="/": state="code"; i+=2; continue
            i+=1; continue
        if state=="string":
            if c=="\\": i+=2; continue
            if c==quote: state="code"; quote=None
            i+=1; continue
        if state=="template":
            if c=="\\": i+=2; continue
            if c==tick: state="code"
            i+=1; continue
        if c=="/" and n=="/": state="line"; i+=2; continue
        if c=="/" and n=="*": state="block"; i+=2; continue
        if c in ("'", '"'): state="string"; quote=c; i+=1; continue
        if c==tick: state="template"; i+=1; continue
        if c==op: depth+=1
        elif c==cl:
            depth-=1
            if depth==0: return i
        i+=1
    raise RuntimeError("unmatched delimiter")

def remove_function(text, name):
    m=re.search(r"(?:async\s+)?function\s+"+re.escape(name)+r"\s*\(", text)
    if not m: return text
    ps=text.find("(",m.start()); pe=match_close(text,ps,"(",")")
    bs=text.find("{",pe); be=match_close(text,bs,"{","}")
    end=be+1
    while end<len(text) and text[end] in "\r\n": end+=1
    return text[:m.start()]+text[end:]

def remove_entry(text,key):
    pos=text.find('key: "'+key+'"')
    if pos<0: return text
    op=pos
    while op>=0 and text[op]!="{": op-=1
    if op<0: raise RuntimeError("entry start not found "+key)
    cl=match_close(text,op,"{","}")
    start=op
    while start>0 and text[start-1] in " \t": start-=1
    if start>0 and text[start-1]=="\n": start-=1
    end=cl+1
    while end<len(text) and text[end] in " \t": end+=1
    if end<len(text) and text[end]==",": end+=1
    if end<len(text) and text[end]=="\r": end+=1
    if end<len(text) and text[end]=="\n": end+=1
    return text[:start]+text[end:]

w=workflow_path.read_text()
for name in [
    "appointmentOpenCase","prepareAppointmentSession",
    "processAppointmentDateResponse","processAppointmentSlotResponse",
    "appointmentPhoneDigits","appointmentFormatDate","appointmentFormatTime",
    "appointmentDateOptions","appointmentParseDateInput",
]:
    w=remove_function(w,name)
for key in obsolete:
    w=remove_entry(w,key)

w=re.sub(r'"APPOINTMENT_SESSION_CONTEXT","PROCESS_APPOINTMENT_DATE_RESPONSE","PROCESS_APPOINTMENT_SLOT_RESPONSE",\s*\n',"",w)
for key in obsolete:
    if 'key: "'+key+'"' in w: raise RuntimeError("obsolete action remains: "+key)
workflow_path.write_text(w)

init=init_path.read_text()
if '0045_remove_unused_appointment_action_wrappers' not in init:
    marker="  ]);"; at=init.rfind(marker)
    if at<0: raise RuntimeError("migration terminator not found")
    migration='''
    {
      key: "0045_remove_unused_appointment_action_wrappers",
      version: "45",
      name: "Remove unused appointment action wrappers",
      up: async client => {
        const obsolete = %s;
        const systemKeys = obsolete.map((key) => "action:" + key);
        await client.query(
          "DELETE FROM platform_rules WHERE action->>'systemGenerated'='true' AND action->>'systemKey'=ANY($1::text[])",
          [systemKeys]
        );
        const remaining = await client.query(
          "SELECT id,name FROM platform_rules WHERE active=TRUE AND action->>'type'='workflow' AND EXISTS (" +
          "SELECT 1 FROM jsonb_array_elements(COALESCE(action->'actions','[]'::jsonb)) step WHERE step->>'key'=ANY($1::text[]))",
          [obsolete]
        );
        if (remaining.rows.length) {
          throw new Error("Active workflow still references removed appointment wrapper: " + remaining.rows.map((row) => row.name).join(", "));
        }
        console.log("onePOS: unused appointment action wrappers removed");
      },
    },
''' % json.dumps(obsolete)
    init=init[:at]+migration+init[at:]
    init_path.write_text(init)
print("cleanup applied")

# rerun after gate trigger update
