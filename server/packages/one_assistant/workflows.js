export function oneAssistantAppointmentRouterWorkflow() {
  const condition = (field, value) => ({ match: "all", conditions: [{ field, operator: "equals", value }] });
  // Communication stays Flow-visible. WhatsApp is an ordinary API step; credentials/base URL remain secure metadata.
  const send = (id, label, channel, message, templateContext = {}) => [
    {
      id, label, apiName: id, key: "CONDITION",
      outcomes: [
        { id: "whatsapp", label: "WhatsApp", condition: condition("variables.messageChannel", "WHATSAPP"), branch: [id + "_whatsapp_api"] },
        { id: "sms", label: "SMS", condition: condition("variables.messageChannel", "SMS"), branch: [id + "_sms"] },
      ],
      defaultLabel: "Unsupported Channel", defaultBranch: [],
    },
    {
      id: id + "_whatsapp_api", label: label + " - WhatsApp API", apiName: id + "_whatsapp_api",
      key: "ONE_HTTP_REQUEST", providerKey: "whatsapp", method: "POST", requireSuccess: true,
      endpoint: "/{{phoneNumberId}}/messages",
      body: {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: { path: "metadata.senderDigits" },
        type: "text",
        text: { body: message },
      },
      variables: templateContext,
    },
    {
      id: id + "_sms", label: label + " - SMS", apiName: id + "_sms",
      key: "SEND_COMMUNICATION", channel: "SMS",
      recipient: { path: "sender" }, message, templateContext,
      conversationId: { path: "metadata.conversationId" },
    },
  ];
  const dateMessage = "Welcome. Please choose an appointment date:\n1. {{date1}}\n2. {{date2}}\n3. Enter another date as DD/MM/YYYY\n\nReply 1, 2, or a date in DD/MM/YYYY format.";
  const slotsMessage = "Available times for {{selectedDate}}:\n{{slotChoices}}\n\nReply with 1-{{slotCount}}.";
  const invalidDateMessage = "Please share a correct input: reply 1, 2, or enter a future date in DD/MM/YYYY format.";
  const invalidSlotMessage = "Please share a correct input: reply with a valid slot number.";
  const confirmationMessage = "Appointment confirmed for {{appointmentDate}} at {{appointmentTime}}.";

  // IMPORTANT: this definition intentionally uses Builder-visible primitives.
  // No PROCESS_APPOINTMENT_* or APPOINTMENT_SESSION_CONTEXT action may own the business process.
  const actions = [
    { id:"channel_router", label:"Route Communication Channel", apiName:"channel_router", key:"CONDITION",
      outcomes:[
        {id:"sms",label:"SMS",condition:condition("channel","SMS"),branch:["sms_channel","date_1_formula","date_2_formula","now_formula","today_formula","get_case","has_case"]},
        {id:"whatsapp",label:"WhatsApp",condition:condition("channel","WHATSAPP"),branch:["whatsapp_channel","date_1_formula","date_2_formula","now_formula","today_formula","get_case","has_case"]}
      ],defaultLabel:"Unsupported Channel",defaultBranch:[] },
    { id:"sms_channel", label:"Use SMS Channel", apiName:"sms_channel", key:"ASSIGNMENT", variableName:"messageChannel", variableType:"text", operator:"set", value:"SMS" },
    { id:"whatsapp_channel", label:"Use WhatsApp Channel", apiName:"whatsapp_channel", key:"ASSIGNMENT", variableName:"messageChannel", variableType:"text", operator:"set", value:"WHATSAPP" },
    { id:"date_1_formula", label:"Calculate Date Choice 1", apiName:"date_1_formula", key:"FORMULA", resourceName:"date1", resultType:"date", expression:"ADDDAYS(TODAY(),1)", inputs:{} },
    { id:"date_2_formula", label:"Calculate Date Choice 2", apiName:"date_2_formula", key:"FORMULA", resourceName:"date2", resultType:"date", expression:"ADDDAYS(TODAY(),2)", inputs:{} },
    { id:"now_formula", label:"Current Date Time", apiName:"now_formula", key:"FORMULA", resourceName:"currentTime", resultType:"datetime", expression:"NOW()", inputs:{} },
    { id:"today_formula", label:"Current Date", apiName:"today_formula", key:"FORMULA", resourceName:"currentDate", resultType:"date", expression:"TODAY()", inputs:{} },
    { id:"get_case", label:"Get Open Booking Case", apiName:"get_case", key:"GET_RECORDS", objectKey:"appointment_booking_case",
      filters:[{field:"sender",operator:"equals",value:{path:"sender"}},{field:"channel",operator:"equals",value:{path:"channel"}},{field:"status",operator:"not_equals",value:"CONFIRMED"},{field:"status",operator:"not_equals",value:"CANCELLED"},{field:"status",operator:"not_equals",value:"EXPIRED"}],
      sortField:"created_at",sortDirection:"desc",limit:1,store:"first" },
    { id:"has_case", label:"Existing Booking Session?", apiName:"has_case", key:"CONDITION",
      outcomes:[
        {id:"restart_upper",label:"Restart with APPOINTMENT",condition:{match:"all",conditions:[{field:"steps.get_case.count",operator:"greater_than",value:0},{field:"body",operator:"equals",value:"APPOINTMENT"}]},branch:["expire_existing_case","create_case","send_initial_prompt","wait_date_timeout","refresh_case_after_date_wait","date_timeout_still_waiting"]},
        {id:"restart_title",label:"Restart with Appointment",condition:{match:"all",conditions:[{field:"steps.get_case.count",operator:"greater_than",value:0},{field:"body",operator:"equals",value:"Appointment"}]},branch:["expire_existing_case","create_case","send_initial_prompt","wait_date_timeout","refresh_case_after_date_wait","date_timeout_still_waiting"]},
        {id:"restart_lower",label:"Restart with appointment",condition:{match:"all",conditions:[{field:"steps.get_case.count",operator:"greater_than",value:0},{field:"body",operator:"equals",value:"appointment"}]},branch:["expire_existing_case","create_case","send_initial_prompt","wait_date_timeout","refresh_case_after_date_wait","date_timeout_still_waiting"]},
        {id:"existing",label:"Existing Session",condition:{match:"all",conditions:[{field:"steps.get_case.count",operator:"greater_than",value:0}]},branch:["route_state"]}
      ],
      defaultLabel:"New Session",defaultBranch:["is_booking_request"] },
    { id:"expire_existing_case", label:"Expire Previous Booking Session", apiName:"expire_existing_case", key:"UPDATE_RECORD", objectKey:"appointment_booking_case",
      recordId:{path:"steps.get_case.record.id"},fieldValues:{status:"EXPIRED",state:{step:"EXPIRED"}} },
    { id:"is_booking_request", label:"Start Appointment Booking?", apiName:"is_booking_request", key:"CONDITION",
      outcomes:[
        {id:"appointment_upper",label:"APPOINTMENT",condition:condition("body","APPOINTMENT"),branch:["create_case","send_initial_prompt","wait_date_timeout","refresh_case_after_date_wait","date_timeout_still_waiting"]},
        {id:"appointment_title",label:"Appointment",condition:condition("body","Appointment"),branch:["create_case","send_initial_prompt","wait_date_timeout","refresh_case_after_date_wait","date_timeout_still_waiting"]},
        {id:"appointment_lower",label:"appointment",condition:condition("body","appointment"),branch:["create_case","send_initial_prompt","wait_date_timeout","refresh_case_after_date_wait","date_timeout_still_waiting"]}
      ],
      defaultLabel:"Ignore Non-Booking Message",defaultBranch:[] },
    { id:"create_case", label:"Create Booking Case", apiName:"create_case", key:"CREATE_RECORD", objectKey:"appointment_booking_case",
      fieldValues:{channel:{path:"channel"},sender:{path:"sender"},recipient:{path:"recipient"},status:"NEW",customer_id:{path:"metadata.customerId",fallback:null},state:{step:"AWAITING_DATE",waitToken:{path:"variables.currentTime"}}} },
    ...send("send_initial_prompt","Send Date Choices",{path:"variables.messageChannel"},dateMessage,{date1:{path:"variables.date1"},date2:{path:"variables.date2"}}),
    { id:"wait_date_timeout", label:"Wait 15 Minutes for Date Reply", apiName:"wait_date_timeout", key:"WAIT_DURATION", amount:15, unit:"minutes" },
    { id:"refresh_case_after_date_wait", label:"Reload Booking Case After Date Wait", apiName:"refresh_case_after_date_wait", key:"GET_RECORDS", objectKey:"appointment_booking_case",
      filters:[{field:"id",operator:"equals",value:{path:"steps.create_case.created.id",fallback:{path:"steps.get_case.record.id"}}}],limit:1,store:"first" },
    { id:"date_timeout_still_waiting", label:"Still Waiting for Date?", apiName:"date_timeout_still_waiting", key:"CONDITION",
      outcomes:[{id:"yes",label:"Still Waiting",condition:{match:"all",conditions:[{field:"steps.refresh_case_after_date_wait.count",operator:"greater_than",value:0},{field:"steps.refresh_case_after_date_wait.record.state.step",operator:"equals",value:"AWAITING_DATE"},{field:"steps.refresh_case_after_date_wait.record.state.waitToken",operator:"equals",value:{path:"variables.currentTime"}}]},branch:["expire_date_case"]}],
      defaultLabel:"Customer Replied",defaultBranch:[] },
    { id:"expire_date_case", label:"Expire Unanswered Date Session", apiName:"expire_date_case", key:"UPDATE_RECORD", objectKey:"appointment_booking_case",
      recordId:{path:"steps.refresh_case_after_date_wait.record.id"},fieldValues:{status:"EXPIRED",state:{step:"EXPIRED"}} },
    { id:"route_state", label:"Route Booking State", apiName:"route_state", key:"CONDITION",
      outcomes:[
        {id:"date",label:"Waiting for Date",condition:condition("steps.get_case.record.state.step","AWAITING_DATE"),branch:["validate_date"]},
        {id:"slot",label:"Waiting for Slot",condition:condition("steps.get_case.record.state.step","AWAITING_SLOT"),branch:["validate_slot"]}
      ],defaultLabel:"Restart Booking",defaultBranch:["reset_case","send_initial_prompt","wait_date_timeout","refresh_case_after_date_wait","date_timeout_still_waiting"] },
    { id:"reset_case", label:"Reset Booking State", apiName:"reset_case", key:"UPDATE_RECORD", objectKey:"appointment_booking_case",
      recordId:{path:"steps.get_case.record.id"},fieldValues:{status:"NEW",state:{step:"AWAITING_DATE",waitToken:{path:"variables.currentTime"}}} },

    { id:"validate_date", label:"Validate Date Reply", apiName:"validate_date", key:"CONDITION",
      outcomes:[
        {id:"one",label:"Choice 1",condition:condition("body","1"),branch:["set_date_1","next_date_1","get_service","service_found"]},
        {id:"two",label:"Choice 2",condition:condition("body","2"),branch:["set_date_2","next_date_2","get_service","service_found"]}
      ],defaultLabel:"DD/MM/YYYY",defaultBranch:["parse_custom_date","custom_date_valid"] },
    { id:"parse_custom_date", label:"Parse Entered Date", apiName:"parse_custom_date", key:"FORMULA", resourceName:"selectedDate", resultType:"date", expression:"PARSEDATE(inputDate)", inputs:{inputDate:{path:"body"}} },
    { id:"custom_date_valid", label:"Entered Date Valid?", apiName:"custom_date_valid", key:"CONDITION",
      outcomes:[{id:"yes",label:"Valid Future Date",condition:{match:"all",conditions:[{field:"variables.selectedDate",operator:"is_not_empty"},{field:"variables.selectedDate",operator:"greater_than",value:{path:"variables.currentDate"}}]},branch:["set_next_custom_date","get_service","service_found"]}],
      defaultLabel:"Invalid Date",defaultBranch:["refresh_date_wait_token","send_invalid_date","wait_date_timeout","refresh_case_after_date_wait","date_timeout_still_waiting"] },
    { id:"refresh_date_wait_token", label:"Refresh Date Reply Timer", apiName:"refresh_date_wait_token", key:"UPDATE_RECORD", objectKey:"appointment_booking_case",
      recordId:{path:"steps.get_case.record.id"},fieldValues:{status:"NEW",state:{step:"AWAITING_DATE",waitToken:{path:"variables.currentTime"}}} },
    ...send("send_invalid_date","Send Invalid Date Reply",{path:"variables.messageChannel"},invalidDateMessage),
    { id:"set_date_1", label:"Use Date Choice 1", apiName:"set_date_1", key:"ASSIGNMENT", variableName:"selectedDate", variableType:"date", operator:"set", value:{path:"variables.date1"} },
    { id:"next_date_1", label:"Date Choice 1 End", apiName:"next_date_1", key:"FORMULA", resourceName:"nextDate", resultType:"date", expression:"ADDDAYS(inputDate,1)", inputs:{inputDate:{path:"variables.date1"}} },
    { id:"set_date_2", label:"Use Date Choice 2", apiName:"set_date_2", key:"ASSIGNMENT", variableName:"selectedDate", variableType:"date", operator:"set", value:{path:"variables.date2"} },
    { id:"next_date_2", label:"Date Choice 2 End", apiName:"next_date_2", key:"FORMULA", resourceName:"nextDate", resultType:"date", expression:"ADDDAYS(inputDate,1)", inputs:{inputDate:{path:"variables.date2"}} },
    { id:"set_next_custom_date", label:"Entered Date End", apiName:"set_next_custom_date", key:"FORMULA", resourceName:"nextDate", resultType:"date", expression:"ADDDAYS(inputDate,1)", inputs:{inputDate:{path:"variables.selectedDate"}} },
    { id:"get_service", label:"Get Active Appointment Service", apiName:"get_service", key:"GET_RECORDS", objectKey:"appointment_service",
      filters:[{field:"active",operator:"equals",value:true}],sortField:"name",sortDirection:"asc",limit:1,store:"first" },
    { id:"service_found", label:"Service Available?", apiName:"service_found", key:"CONDITION",
      outcomes:[{id:"yes",label:"Service Found",condition:{match:"all",conditions:[{field:"steps.get_service.count",operator:"greater_than",value:0}]},branch:["get_resource_service","resource_service_found"]}],
      defaultLabel:"No Service",defaultBranch:["send_no_service"] },
    ...send("send_no_service","Send No Service Reply",{path:"variables.messageChannel"},"No appointment service is currently available."),
    { id:"get_resource_service", label:"Get Service Resource Assignment", apiName:"get_resource_service", key:"GET_RECORDS", objectKey:"appointment_resource_service",
      filters:[{field:"service_id",operator:"equals",value:{path:"steps.get_service.record.id"}},{field:"active",operator:"equals",value:true}],limit:1,store:"first" },
    { id:"resource_service_found", label:"Service Resource Available?", apiName:"resource_service_found", key:"CONDITION",
      outcomes:[{id:"yes",label:"Assignment Found",condition:{match:"all",conditions:[{field:"steps.get_resource_service.count",operator:"greater_than",value:0}]},branch:["get_resource","resource_found"]}],
      defaultLabel:"No Resource",defaultBranch:["send_no_resource"] },
    { id:"get_resource", label:"Get Assigned Appointment Resource", apiName:"get_resource", key:"GET_RECORDS", objectKey:"appointment_resource",
      filters:[{field:"id",operator:"equals",value:{path:"steps.get_resource_service.record.resource_id"}},{field:"active",operator:"equals",value:true}],limit:1,store:"first" },
    { id:"resource_found", label:"Resource Available?", apiName:"resource_found", key:"CONDITION",
      outcomes:[{id:"yes",label:"Resource Found",condition:{match:"all",conditions:[{field:"steps.get_resource.count",operator:"greater_than",value:0}]},branch:["get_availability","availability_rules_found"]}],
      defaultLabel:"No Resource",defaultBranch:["send_no_resource"] },
    ...send("send_no_resource","Send No Resource Reply",{path:"variables.messageChannel"},"No appointment resource is currently available."),
    { id:"get_availability", label:"Get Availability Rules", apiName:"get_availability", key:"GET_RECORDS", objectKey:"appointment_availability_rule",
      filters:[{field:"resource_id",operator:"equals",value:{path:"steps.get_resource.record.id"}},{field:"active",operator:"equals",value:true}],store:"all",limit:50 },
    { id:"availability_rules_found", label:"Availability Rules Found?", apiName:"availability_rules_found", key:"CONDITION",
      outcomes:[{id:"yes",label:"Rules Found",condition:{match:"all",conditions:[{field:"steps.get_availability.count",operator:"greater_than",value:0}]},branch:["expand_slots","get_busy_appointments","get_busy_holds","set_busy_appointments","append_busy_holds","exclude_busy_slots","sort_slots","format_slots","availability_found"]}],
      defaultLabel:"No Rules",defaultBranch:["reset_to_date","send_no_slots","wait_date_timeout","refresh_case_after_date_wait","date_timeout_still_waiting"] },
    { id:"expand_slots", label:"Expand Availability Windows", apiName:"expand_slots", key:"TIME_WINDOW_EXPAND",
      collection:{path:"steps.get_availability.records"},date:{path:"variables.selectedDate"},
      durationMinutes:{path:"steps.get_resource_service.record.duration_minutes",fallback:{path:"steps.get_service.record.duration_minutes"}},
      startField:"start_time",endField:"end_time",weekdayField:"weekday",intervalField:"slot_interval_minutes",limit:200 },
    { id:"get_busy_appointments", label:"Get Busy Appointments", apiName:"get_busy_appointments", key:"GET_RECORDS", objectKey:"appointment",
      filters:[{field:"resource_id",operator:"equals",value:{path:"steps.get_resource.record.id"}},{field:"status",operator:"not_equals",value:"CANCELLED"},{field:"status",operator:"not_equals",value:"NO_SHOW"},{field:"starts_at",operator:"greater_than_or_equal",value:{path:"variables.selectedDate"}},{field:"starts_at",operator:"less_than",value:{path:"variables.nextDate"}}],store:"all",limit:200 },
    { id:"get_busy_holds", label:"Get Active Slot Holds", apiName:"get_busy_holds", key:"GET_RECORDS", objectKey:"appointment_slot_hold",
      filters:[{field:"resource_id",operator:"equals",value:{path:"steps.get_resource.record.id"}},{field:"status",operator:"equals",value:"ACTIVE"},{field:"expires_at",operator:"greater_than",value:{path:"variables.currentTime"}}],store:"all",limit:200 },
    { id:"set_busy_appointments", label:"Set Busy Appointment Intervals", apiName:"set_busy_appointments", key:"ASSIGNMENT",
      variableName:"busyIntervals",variableType:"collection",operator:"set",value:{path:"steps.get_busy_appointments.records"} },
    { id:"append_busy_holds", label:"Append Active Holds", apiName:"append_busy_holds", key:"ASSIGNMENT",
      variableName:"busyIntervals",variableType:"collection",operator:"append",value:{path:"steps.get_busy_holds.records"} },
    { id:"exclude_busy_slots", label:"Exclude Busy Time Intervals", apiName:"exclude_busy_slots", key:"COLLECTION_EXCLUDE_OVERLAPS",
      collection:{path:"steps.expand_slots.collection"},busyCollection:{path:"variables.busyIntervals"},
      candidateStartField:"startsAt",candidateEndField:"endsAt",busyStartField:"starts_at",busyEndField:"ends_at" },
    { id:"sort_slots", label:"Sort Available Slots", apiName:"sort_slots", key:"COLLECTION_SORT",
      collection:{path:"steps.exclude_busy_slots.collection"},sortField:"startsAt",sortDirection:"asc",limit:5 },
    { id:"format_slots", label:"Format Slot Choices", apiName:"format_slots", key:"COLLECTION_FORMAT_TEXT",
      collection:{path:"steps.sort_slots.collection"},lineTemplate:"{{index}}. {{item.time}}",separator:"\n",startIndex:1,limit:5 },
    { id:"availability_found", label:"Available Slots Found?", apiName:"availability_found", key:"CONDITION",
      outcomes:[{id:"yes",label:"Slots Found",condition:{match:"all",conditions:[{field:"steps.sort_slots.count",operator:"greater_than",value:0}]},branch:["save_date_state","send_slots","wait_slot_timeout","refresh_case_after_slot_wait","slot_timeout_still_waiting"]}],
      defaultLabel:"No Slots",defaultBranch:["reset_to_date","send_no_slots","wait_date_timeout","refresh_case_after_date_wait","date_timeout_still_waiting"] },
    { id:"reset_to_date", label:"Wait for Another Date", apiName:"reset_to_date", key:"UPDATE_RECORD", objectKey:"appointment_booking_case",
      recordId:{path:"steps.get_case.record.id",fallback:{path:"steps.create_case.created.id"}},fieldValues:{status:"NEW",state:{step:"AWAITING_DATE",waitToken:{path:"variables.currentTime"}}} },
    { id:"save_date_state", label:"Save Selected Date", apiName:"save_date_state", key:"UPDATE_RECORD", objectKey:"appointment_booking_case",
      recordId:{path:"steps.get_case.record.id",fallback:{path:"steps.create_case.created.id"}},
      fieldValues:{service_id:{path:"steps.get_service.record.id"},status:"SLOT_SELECTED",state:{step:"AWAITING_SLOT",selectedDate:{path:"variables.selectedDate"},resourceId:{path:"steps.get_resource.record.id"},slots:{path:"steps.sort_slots.collection"},waitToken:{path:"variables.currentTime"}}} },
    ...send("send_slots","Send Available Slots",{path:"variables.messageChannel"},slotsMessage,{selectedDate:{path:"variables.selectedDate"},slotChoices:{path:"steps.format_slots.text"},slotCount:{path:"steps.sort_slots.count"}}),
    { id:"wait_slot_timeout", label:"Wait 15 Minutes for Slot Reply", apiName:"wait_slot_timeout", key:"WAIT_DURATION", amount:15, unit:"minutes" },
    { id:"refresh_case_after_slot_wait", label:"Reload Booking Case After Slot Wait", apiName:"refresh_case_after_slot_wait", key:"GET_RECORDS", objectKey:"appointment_booking_case",
      filters:[{field:"id",operator:"equals",value:{path:"steps.get_case.record.id",fallback:{path:"steps.create_case.created.id"}}}],limit:1,store:"first" },
    { id:"slot_timeout_still_waiting", label:"Still Waiting for Slot?", apiName:"slot_timeout_still_waiting", key:"CONDITION",
      outcomes:[{id:"yes",label:"Still Waiting",condition:{match:"all",conditions:[{field:"steps.refresh_case_after_slot_wait.count",operator:"greater_than",value:0},{field:"steps.refresh_case_after_slot_wait.record.state.step",operator:"equals",value:"AWAITING_SLOT"},{field:"steps.refresh_case_after_slot_wait.record.state.waitToken",operator:"equals",value:{path:"variables.currentTime"}}]},branch:["expire_slot_case"]}],
      defaultLabel:"Customer Replied",defaultBranch:[] },
    { id:"expire_slot_case", label:"Expire Unanswered Slot Session", apiName:"expire_slot_case", key:"UPDATE_RECORD", objectKey:"appointment_booking_case",
      recordId:{path:"steps.refresh_case_after_slot_wait.record.id"},fieldValues:{status:"EXPIRED",state:{step:"EXPIRED"}} },
    ...send("send_no_slots","Send No Slots Reply",{path:"variables.messageChannel"},"There are no available appointments on {{selectedDate}}. Please reply with another date in DD/MM/YYYY format.",{selectedDate:{path:"variables.selectedDate"}}),

    { id:"validate_slot", label:"Validate Slot Reply", apiName:"validate_slot", key:"CONDITION",
      outcomes:[
        {id:"one",label:"Slot 1",condition:{match:"all",conditions:[{field:"body",operator:"equals",value:"1"},{field:"steps.get_case.record.state.slots.0.startsAt",operator:"is_not_empty"}]},branch:["select_slot_1","create_appointment","confirm_case","send_confirmation"]},
        {id:"two",label:"Slot 2",condition:{match:"all",conditions:[{field:"body",operator:"equals",value:"2"},{field:"steps.get_case.record.state.slots.1.startsAt",operator:"is_not_empty"}]},branch:["select_slot_2","create_appointment","confirm_case","send_confirmation"]},
        {id:"three",label:"Slot 3",condition:{match:"all",conditions:[{field:"body",operator:"equals",value:"3"},{field:"steps.get_case.record.state.slots.2.startsAt",operator:"is_not_empty"}]},branch:["select_slot_3","create_appointment","confirm_case","send_confirmation"]},
        {id:"four",label:"Slot 4",condition:{match:"all",conditions:[{field:"body",operator:"equals",value:"4"},{field:"steps.get_case.record.state.slots.3.startsAt",operator:"is_not_empty"}]},branch:["select_slot_4","create_appointment","confirm_case","send_confirmation"]},
        {id:"five",label:"Slot 5",condition:{match:"all",conditions:[{field:"body",operator:"equals",value:"5"},{field:"steps.get_case.record.state.slots.4.startsAt",operator:"is_not_empty"}]},branch:["select_slot_5","create_appointment","confirm_case","send_confirmation"]}
      ],defaultLabel:"Invalid Slot",defaultBranch:["refresh_slot_wait_token","send_invalid_slot","wait_slot_timeout","refresh_case_after_slot_wait","slot_timeout_still_waiting"] },
    ...[1,2,3,4,5].map((number)=>({id:`select_slot_${number}`,label:`Select Slot ${number}`,apiName:`select_slot_${number}`,key:"ASSIGNMENT",variableName:"selectedSlot",variableType:"record",operator:"set",value:{path:`steps.get_case.record.state.slots.${number-1}`}})),
    { id:"refresh_slot_wait_token", label:"Refresh Slot Reply Timer", apiName:"refresh_slot_wait_token", key:"UPDATE_RECORD", objectKey:"appointment_booking_case",
      recordId:{path:"steps.get_case.record.id"},fieldValues:{status:"SLOT_SELECTED",state:{step:"AWAITING_SLOT",selectedDate:{path:"steps.get_case.record.state.selectedDate"},resourceId:{path:"steps.get_case.record.state.resourceId"},slots:{path:"steps.get_case.record.state.slots"},waitToken:{path:"variables.currentTime"}}} },
    ...send("send_invalid_slot","Send Invalid Slot Reply",{path:"variables.messageChannel"},invalidSlotMessage),
    { id:"create_appointment", label:"Create Appointment", apiName:"create_appointment", key:"CREATE_RECORD", objectKey:"appointment",
      fieldValues:{
        service_id:{path:"steps.get_case.record.service_id"},resource_id:{path:"steps.get_case.record.state.resourceId"},
        customer_id:{path:"steps.get_case.record.customer_id"},customer_phone:{path:"sender"},
        starts_at:{path:"variables.selectedSlot.startsAt"},ends_at:{path:"variables.selectedSlot.endsAt"},
        status:"CONFIRMED",source_channel:{path:"channel"}
      } },
    { id:"confirm_case", label:"Mark Booking Confirmed", apiName:"confirm_case", key:"UPDATE_RECORD", objectKey:"appointment_booking_case",
      recordId:{path:"steps.get_case.record.id"},fieldValues:{status:"CONFIRMED",appointment_id:{path:"steps.create_appointment.created.id"},state:{step:"CONFIRMED"}} },
    ...send("send_confirmation","Send Appointment Confirmation",{path:"variables.messageChannel"},confirmationMessage,{appointmentDate:{path:"variables.selectedSlot.date"},appointmentTime:{path:"variables.selectedSlot.time"}}),
  ];

  return {
    objectKey:"communication_event",name:"OneAssistant - Booking Channel Router",triggerKey:"communication_message_received",conditions:[],
    action:{type:"workflow",builder2:true,flowType:"platform_event",apiName:"OneAssistant_Booking_Channel_Router",
      description:"Fully Builder-visible appointment booking flow. Business decisions, record reads/writes and customer messages are explicit nodes.",
      apiVersion:"66.0",runContext:"system",start:{eventKey:"communication_message_received"},scope:"one_assistant",
      subflowCapability:"assistant.booking.router",
      resources:[
        {apiName:"date1",resourceType:"Variable",dataType:"Date",description:"First offered booking date."},
        {apiName:"date2",resourceType:"Variable",dataType:"Date",description:"Second offered booking date."},
        {apiName:"selectedDate",resourceType:"Variable",dataType:"Date",description:"Customer-selected booking date."},
        {apiName:"nextDate",resourceType:"Variable",dataType:"Date",description:"Exclusive end date used to scope conflict queries."},
        {apiName:"slotChoices",resourceType:"Variable",dataType:"Text",description:"Rendered list of available slots."},
        {apiName:"slotCount",resourceType:"Variable",dataType:"Number",description:"Number of available slots."},
        {apiName:"currentTime",resourceType:"Variable",dataType:"DateTime",description:"Current server date and time."},
        {apiName:"currentDate",resourceType:"Variable",dataType:"Date",description:"Current server date used to reject past customer dates."},
        {apiName:"busyIntervals",resourceType:"Variable",dataType:"Collection",description:"Existing appointments and active slot holds."},
        {apiName:"selectedSlot",resourceType:"Variable",dataType:"Record",description:"Selected appointment slot."}
      ],tests:[],builderGroups:[],builderLayout:{mode:"AUTO",positions:{},edges:[]},actions},active:true
  };
}

export
