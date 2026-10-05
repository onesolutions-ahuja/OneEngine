// Declarative package-owned runtime Flows. Generic runtime code imports these definitions;
// business behavior remains visible/editable as Flow metadata rather than imperative handlers.
const flow=(systemKey,name,inputContract,outputContract,actions)=>({systemKey,name,triggerKey:"manual",action:{type:"workflow",systemGenerated:true,systemKey,scope:"package",capabilityType:"workflow",capabilityKey:systemKey.replace(/^flow:/,""),apiName:systemKey.replace(/^flow:/,"").replaceAll(".","_").toUpperCase(),flowType:"AUTOLAUNCHED",inputContract,outputContract,actions}});
const input=(name,type="text",required=true)=>({name,label:name,type,required});
const output=(name,type="text")=>({name,label:name,type,source:`variables.${name}`});

export const PACKAGE_RUNTIME_FLOWS=[
 flow("flow:attendance.clock_in","Attendance · Clock In",[input("userId"),input("storeId"),input("now","text")],[output("recordId"),output("alreadyOpen","boolean")],[
  {id:"find_open",label:"Find Open Attendance",key:"GET_RECORDS",objectKey:"attendance",filters:[{field:"user_id",operator:"equals",value:{path:"$record.userId"}},{field:"status",operator:"equals",value:"open"}],limit:1,store:"first"},
  {id:"open_exists",label:"Open Attendance Exists?",key:"CONDITION",outcomes:[{id:"yes",label:"Already Open",condition:{match:"all",conditions:[{field:"steps.find_open.record.id",operator:"is_not_blank"}]},branch:["set_existing_id","set_already_open"]}],defaultLabel:"Create Attendance",defaultBranch:["create_attendance","set_created_id","set_not_already_open"]},
  {id:"create_attendance",label:"Create Attendance",key:"CREATE_RECORD",objectKey:"attendance",fieldValues:{user_id:{path:"$record.userId"},store_id:{path:"$record.storeId"},status:"open",clock_in:{path:"$record.now"}}},
  {id:"set_existing_id",label:"Return Existing Record",key:"ASSIGNMENT",variableName:"recordId",variableType:"text",operator:"set",value:{path:"steps.find_open.record.id"}},
  {id:"set_created_id",label:"Return Created Record",key:"ASSIGNMENT",variableName:"recordId",variableType:"text",operator:"set",value:{path:"steps.create_attendance.record.id"}},
  {id:"set_already_open",label:"Already Open",key:"ASSIGNMENT",variableName:"alreadyOpen",variableType:"boolean",operator:"set",value:true},
  {id:"set_not_already_open",label:"New Attendance",key:"ASSIGNMENT",variableName:"alreadyOpen",variableType:"boolean",operator:"set",value:false}
 ]),
 flow("flow:attendance.clock_out","Attendance · Clock Out",[input("userId"),input("now","text")],[output("recordId"),output("closed","boolean")],[
  {id:"find_open",label:"Find Open Attendance",key:"GET_RECORDS",objectKey:"attendance",filters:[{field:"user_id",operator:"equals",value:{path:"$record.userId"}},{field:"status",operator:"equals",value:"open"}],limit:1,store:"first"},
  {id:"open_exists",label:"Open Attendance Exists?",key:"CONDITION",outcomes:[{id:"yes",label:"Close Attendance",condition:{match:"all",conditions:[{field:"steps.find_open.record.id",operator:"is_not_blank"}]},branch:["close_attendance","set_closed_id","set_closed"]}],defaultLabel:"Nothing Open",defaultBranch:["set_not_closed"]},
  {id:"close_attendance",label:"Close Attendance",key:"UPDATE_RECORD",objectKey:"attendance",recordId:{path:"steps.find_open.record.id"},fieldValues:{status:"closed",clock_out:{path:"$record.now"}}},
  {id:"set_closed_id",label:"Return Closed Record",key:"ASSIGNMENT",variableName:"recordId",variableType:"text",operator:"set",value:{path:"steps.find_open.record.id"}},
  {id:"set_closed",label:"Closed",key:"ASSIGNMENT",variableName:"closed",variableType:"boolean",operator:"set",value:true},
  {id:"set_not_closed",label:"Not Closed",key:"ASSIGNMENT",variableName:"closed",variableType:"boolean",operator:"set",value:false}
 ]),
 flow("flow:inventory.movement.create","Inventory · Apply Movement",[input("productId"),input("storeId"),input("movementType"),input("quantityChange","number"),input("referenceType","text",false),input("referenceId","text",false),input("reason","text",false),input("createdBy","text",false)],[output("movementId"),output("balance","number")],[
  {id:"get_stock",label:"Get Store Stock",key:"GET_RECORDS",objectKey:"inventory",filters:[{field:"product_id",operator:"equals",value:{path:"$record.productId"}},{field:"store_id",operator:"equals",value:{path:"$record.storeId"}}],limit:1,store:"first"},
  {id:"new_balance",label:"Calculate New Balance",key:"FORMULA",resourceName:"balance",resultType:"number",expression:"current + change",inputs:{current:{path:"steps.get_stock.record.quantity",fallback:0},change:{path:"$record.quantityChange"}}},
  {id:"stock_exists",label:"Stock Position Exists?",key:"CONDITION",outcomes:[{id:"yes",label:"Update Stock",condition:{match:"all",conditions:[{field:"steps.get_stock.record.id",operator:"is_not_blank"}]},branch:["update_stock"]}],defaultLabel:"Create Stock",defaultBranch:["create_stock"]},
  {id:"update_stock",label:"Update Store Stock",key:"UPDATE_RECORD",objectKey:"inventory",recordId:{path:"steps.get_stock.record.id"},fieldValues:{quantity:{path:"variables.balance"}}},
  {id:"create_stock",label:"Create Store Stock",key:"CREATE_RECORD",objectKey:"inventory",fieldValues:{product_id:{path:"$record.productId"},store_id:{path:"$record.storeId"},quantity:{path:"variables.balance"}}},
  {id:"create_movement",label:"Create Movement",key:"CREATE_RECORD",objectKey:"inventory_movement",fieldValues:{product_id:{path:"$record.productId"},store_id:{path:"$record.storeId"},movement_type:{path:"$record.movementType"},quantity_change:{path:"$record.quantityChange"},balance_after:{path:"variables.balance"},reference_type:{path:"$record.referenceType"},reference_id:{path:"$record.referenceId"},reason:{path:"$record.reason"},created_by:{path:"$record.createdBy"}}},
  {id:"set_movement_id",label:"Return Movement",key:"ASSIGNMENT",variableName:"movementId",variableType:"text",operator:"set",value:{path:"steps.create_movement.record.id"}}
 ]),
 flow("flow:online_order.transition","Online Order · Transition",[input("orderId"),input("toStatus"),input("reason","text",false),input("now","text")],[output("orderId")],[
  {id:"get_order",label:"Get Online Order",key:"GET_RECORDS",objectKey:"online_order",filters:[{field:"id",operator:"equals",value:{path:"$record.orderId"}}],limit:1,store:"first"},
  {id:"update_order",label:"Update Order Status",key:"UPDATE_RECORD",objectKey:"online_order",recordId:{path:"steps.get_order.record.id"},fieldValues:{status:{path:"$record.toStatus"},updated_at:{path:"$record.now"}}},
  {id:"set_order_id",label:"Return Order",key:"ASSIGNMENT",variableName:"orderId",variableType:"text",operator:"set",value:{path:"steps.get_order.record.id"}}
 ])
];
