// Input contracts for executors which predate registry schemas. These contracts
// are server metadata; the builder never branches on provider or action names.
// Field names mirror platformWorkflow executors and their existing validators.
const text = title => ({type:'string',...(title?{title}:{})})
const number = title => ({type:'number',...(title?{title}:{})})
const boolean = title => ({type:'boolean',...(title?{title}:{})})
const object = title => ({type:'object',...(title?{title}:{})})
const multiline = title => ({type:'string',format:'multiline',title})
const schema = (properties={},required=[]) => ({type:'object',properties,required})
const connector = {connectorInstanceId:text('Connector Instance'),payload:object('Operation Payload')}
const record = {objectKey:text('Object'),recordId:text('Record ID')}
const communication = {recipient:text('To'),message:multiline('Message'),contentMode:{type:'string',title:'Content Source',enum:['CUSTOM','TEMPLATE']},templateId:text('Template'),templateContext:object('Template Values'),idempotencyKey:text('Idempotency Key')}
const inventoryFields={storeId:text(),productId:text(),quantity:number(),fromStoreId:text(),toStoreId:text(),referenceId:text(),referenceType:text(),reason:text(),notes:multiline('Notes')}
const conditionSchema=schema({match:{type:'string',enum:['all','any']},conditions:{type:'array',items:schema({field:text(),operator:{type:'string',enum:['equals','not_equals','greater_than','greater_than_or_equal','less_than','less_than_or_equal','is_empty','is_not_empty','changed']},value:text()})}})
const schemas={
 INVENTORY_ACTION:schema({operation:{type:'string',enum:['ADJUSTMENT_IN','ADJUSTMENT_OUT','WASTAGE','SHRINKAGE','OPENING','TRANSFER','RECONCILE','REBUILD']},...inventoryFields},['operation']),
 RECONCILE_INVENTORY:schema({storeId:text(),productId:text()}),
 REBUILD_INVENTORY:schema({storeId:text(),productId:text()}),
 VALIDATION:schema(),
 CONDITION:schema({outcomes:{type:'array',items:schema({id:text('Outcome API Name'),label:text(),condition:conditionSchema,branch:{type:'array',items:text('Element ID')}},['id','label','condition'])},defaultBranch:{type:'array',items:text('Element ID')},defaultLabel:text()}),
 PAYMENT_START:schema({...connector,amount:number('Amount'),currency:text('Currency'),saleId:text('Sale ID')},['amount']),
 PAYMENT_CANCEL:schema({...connector,providerTransactionId:text('Transaction Reference')},['providerTransactionId']),
 PAYMENT_REFUND:schema({...connector,providerTransactionId:text('Transaction Reference'),amount:number('Amount')},['providerTransactionId']),
 PRINT_RECEIPT:schema({...connector,inputs:object('Receipt Inputs')}),
 SEND_APPOINTMENT_CONFIRMATION:schema({appointmentId:text(),channel:text(),recipient:text('To'),message:multiline('Message'),timezone:text()}),
 PROCESS_APPOINTMENT_CONVERSATION:schema({channel:text(),sender:text(),recipient:text(),body:multiline('Body'),conversationId:text(),sourceMessageId:text(),customerId:text()},['channel']),
 SEND_APPOINTMENT_CONVERSATION_REPLY:schema({channel:text(),recipient:text(),message:multiline('Message'),conversationId:text(),recordId:text()},['channel']),
 CREATE_APPOINTMENT_BOOKING_CASE:schema({channel:text(),sourceMessageId:text(),sender:text(),recipient:text(),subject:text(),body:multiline('Body'),customerId:text(),state:object()},['channel']),
 ISSUE_APPOINTMENT_BOOKING_LINK:schema({bookingCaseId:text(),purpose:text(),ttlMinutes:number(),publicBaseUrl:text(),metadata:object()},['bookingCaseId']),
 RUN_ASSISTANT_SUBFLOW:schema({capability:text(),channel:text(),providerPackageKey:text(),required:boolean(),inputs:object()},['capability']),
 FIND_APPOINTMENT_SLOTS:schema({serviceId:text(),resourceId:text(),from:text(),to:text(),limit:number()},['serviceId']),
 HOLD_APPOINTMENT_SLOT:schema({storeId:text(),serviceId:text(),resourceId:text(),customerId:text(),conversationId:text(),startsAt:text(),endsAt:text(),holdMinutes:number(),idempotencyKey:text(),metadata:object()},['serviceId','resourceId','startsAt','endsAt']),
 RELEASE_APPOINTMENT_SLOT:schema({holdId:text(),reason:text()},['holdId']),
 LIST_APPOINTMENT_PAYMENT_PROVIDERS:schema(),
 CREATE_APPOINTMENT_PAYMENT_REQUEST:schema({amount:number(),holdId:text(),appointmentId:text(),providerPackageKey:text(),currency:text(),expiresAt:text(),metadata:object()},['amount']),
 COMPLETE_APPOINTMENT_PAYMENT:schema({paymentRequestId:text()},['paymentRequestId']),
 CALCULATE_APPOINTMENT_PAYMENT:schema({serviceId:text()},['serviceId']),
 CONFIRM_APPOINTMENT:schema({holdId:text(),customerId:text(),customerName:text(),customerPhone:text(),customerEmail:text(),sourceChannel:text(),notes:multiline('Notes'),paymentStatus:text(),amountDue:number(),amountPaid:number(),metadata:object()},['holdId']),
 LICENCE_REQUEST_PACKAGE:schema({packageKey:text()},['packageKey']),
 ONLINE_ORDER_TRANSITION:schema({toStatus:text('Target Status'),orderId:text(),reason:text()},['toStatus']),
 SET_FIELD:schema({field:text('Field'),value:text('Value')},['field']),
 TILL_UI_ACTION:schema({uiAction:text('UI Action'),config:object('Configuration')},['uiAction']),
 SHOW_MESSAGE:schema({message:multiline('Message')},['message']),
 POST_CREDIT_PAYMENT:schema({customerId:text(),amount:number()},['customerId','amount']),
 FREEZE_CREDIT_ACCOUNT:schema({customerId:text()},['customerId']),
 UNFREEZE_CREDIT_ACCOUNT:schema({customerId:text()},['customerId']),
 SEND_CREDIT_STATEMENT:schema({customerId:text()},['customerId']),
 UPDATE_RELATED_RECORD:schema({...record,relationshipKey:text(),parentObjectId:text(),fieldValues:object('Field Values')},['relationshipKey','fieldValues']),
 CREATE_RELATED_RECORD:schema({...record,relationshipKey:text(),parentObjectId:text(),fieldValues:object('Field Values')},['relationshipKey','fieldValues']),
 DELETE_RECORD:schema(record,['recordId']),
 ASSIGN_RECORD:schema({...record,assignee:text('Assigned To')},['recordId','assignee']),
 ADD_RELATIONSHIP:schema({...record,relationshipKey:text(),relatedRecordId:text()},['relationshipKey','relatedRecordId']),
 REMOVE_RELATIONSHIP:schema({...record,relationshipKey:text(),relatedRecordId:text()},['relationshipKey','relatedRecordId']),
 IN_APP_NOTIFICATION:schema({message:multiline('Message'),templateKey:text()}),
 SEND_EMAIL:schema({...communication,subject:text(),body:multiline('Body')},['recipient']),
 EMAIL_ALERT:schema({...communication,subject:text()},['recipient','templateId']),
 SEND_SMS:schema(communication,['recipient']),
 SEND_WHATSAPP:schema(communication,['recipient']),
 UPDATE_WEB_LISTING:schema({productId:text(),webShopTitleOverride:text(),webShopDescriptionOverride:multiline('Description'),webShopImageOverride:text(),webShopCategoryOverride:text(),webShopSortOrder:number(),webShopDeliveryEligible:boolean(),webShopPickupEligible:boolean(),webShopFeatured:boolean(),webShopPriceOverride:number()},['productId']),
 SET_WEB_FEATURED:schema({productId:text(),webShopFeatured:boolean()},['productId']),
 CALL_FUNCTION:schema({functionKey:text(),inputs:object()},['functionKey']),
 RUN_SUBFLOW:schema({workflowId:text(),workflowInputs:object('Input Variables')},['workflowId']),
 WEBHOOK:schema({url:text('Endpoint')},['url']),
 WAIT:schema({durationSeconds:number('Duration (Seconds)'),resumeAt:text('Resume At')}),
 QUICKBOOKS_SYNC_VENDORS:schema({connectionId:text(),supplierId:text()}),
 QUICKBOOKS_SYNC_PURCHASES:schema({connectionId:text(),purchaseId:text(),invoiceId:text()}),
 QUICKBOOKS_SYNC_SUPPLIER_PAYMENTS:schema({connectionId:text(),paymentId:text()}),
 QUICKBOOKS_SYNC_SUPPLIER_CREDITS:schema({connectionId:text(),returnId:text()}),
 QUICKBOOKS_RETRY_FAILED_SYNC:schema({syncType:{type:'string',enum:['vendors','purchases','payments','credits']},connectionId:text(),supplierId:text(),purchaseId:text(),invoiceId:text(),paymentId:text(),returnId:text()}),
 SHOPIFY_TEST_CONNECTION:schema({connectionId:text()}),
 SHOPIFY_PROCESS_WEBHOOK:schema({connectionId:text(),eventId:text(),deliveryId:text()}),
 SHOPIFY_SYNC_PRODUCTS:schema({connectionId:text()}),
 SHOPIFY_SYNC_INVENTORY:schema({connectionId:text()}),
 SHOPIFY_RETRY_FAILED_SYNC:schema({syncType:{type:'string',enum:['products','inventory','fulfilment','refund']},connectionId:text(),orderId:text(),returnId:text()}),
 SHOPIFY_EXPORT_FULFILMENT:schema({connectionId:text(),orderId:text(),notifyCustomer:boolean()}),
 SHOPIFY_EXPORT_REFUND:schema({connectionId:text(),returnId:text()}),
 UBER_UPLOAD_MENU:schema({storeId:text()}),
 UBER_ACCEPT_ORDER:schema({orderId:text()}),
 UBER_DENY_ORDER:schema({orderId:text(),reason:text()}),
 UBER_UPDATE_ITEM_PRICE:schema({productId:text(),itemId:text(),price:number('Price')}),
 UBER_SET_ITEM_UNAVAILABLE:schema({productId:text(),itemId:text(),suspendUntil:number('Suspend Until (Unix Seconds)')}),
 UBER_SET_ITEM_AVAILABLE:schema({productId:text(),itemId:text()}),
 STOP:schema({reason:text()}),
}
for(const key of ['CONNECTOR_HEALTH_CHECK','CONNECTOR_ENABLE','CONNECTOR_DISABLE','PRINT_KITCHEN_TICKET','OPEN_CASH_DRAWER','SCANNER_STATUS','CONNECTOR_TEST_CONNECTION'])schemas[key]=schema(connector)
for(const key of ['GLOBAL_PRODUCT_LOOKUP_BARCODE','OPEN_FOOD_FACTS_LOOKUP_PRODUCT','GO_UPC_LOOKUP_PRODUCT'])schemas[key]=schema({barcode:text('Barcode')})
for(const key of ['OPEN_FOOD_FACTS_TEST_CONNECTION','GO_UPC_TEST_CONNECTION','QUICKBOOKS_TEST_CONNECTION','UBER_GET_STORES','UBER_TEST_CONNECTION','SEND_PASSWORD_RESET_EMAIL','SEND_USER_INVITATION'])schemas[key]=schema()
for(const key of ['PUBLISH_TO_WEB_SHOP','UNPUBLISH_FROM_WEB_SHOP'])schemas[key]=schema({productId:text()},['productId'])
const filterSchema={type:'array',items:conditionSchema.properties.conditions.items};
const refinements={
 GET_RECORDS:{filters:filterSchema,match:{type:'string',enum:['all','any']},sortDirection:{type:'string',enum:['asc','desc']},store:{type:'string',enum:['first','all']}},
 COLLECTION_FILTER:{filters:filterSchema,match:{type:'string',enum:['all','any']}},
 WAIT_FOR_CONDITIONS:{waitCondition:conditionSchema},
 RECORD_CHOICE_SET:{filters:filterSchema,match:{type:'string',enum:['all','any']},sortField:text('Sort Field'),sortDirection:{type:'string',enum:['asc','desc']}},
}
export function actionWithInputSchema(definition) {
 if(!definition)return definition;
 const registered=definition.schema||schemas[definition.key];
 if(!registered)return definition;
 const properties={...registered.properties,...refinements[definition.key]};
 for(const key of ['objectKey','object'])if(properties[key])properties[key]={...properties[key],title:properties[key].title||'Object','x-lookup':'object'};
 return {...definition,schema:{...registered,properties}};
}
