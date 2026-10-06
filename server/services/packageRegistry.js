import { oneAssistantManifest } from "../packages/oneAssistantManifest.js";
import { resolvePackagePlan, satisfiesPackageVersion, comparePackageVersions, resolveFeaturePlan } from "../packages/runtime/packagePlanning.js";
export { resolvePackagePlan, satisfiesPackageVersion, comparePackageVersions, resolveFeaturePlan } from "../packages/runtime/packagePlanning.js";
import { packageManifestCatalog } from "../packages/packageManifestCatalog.js";

const uberEatsWorkflowDefinitions = () => [
  {
    "objectKey": "uber_eats_connection",
    "name": "GPT - Uber Eats - Get Stores",
    "triggerKey": "manual",
    "active": true,
    "lifecycleStatus": "ACTIVE",
    "action": {
      "type": "workflow",
      "scope": "uber_eats",
      "flowType": "AUTOLAUNCHED",
      "apiName": "GPT_UBER_EATS_GET_STORES",
      "capabilityKey": "GPT_UBER_EATS_GET_STORES",
      "inputContract": [],
      "outputContract": [
        {
          "name": "success",
          "type": "boolean",
          "source": "variables.success"
        },
        {
          "name": "data",
          "type": "object",
          "source": "variables.data"
        }
      ],
      "resources": [
        {
          "value": "variables.success",
          "apiName": "success",
          "label": "Success",
          "type": "Variable",
          "dataType": "Boolean",
          "defaultValue": false,
          "isCollection": false,
          "availableInput": false,
          "availableOutput": true,
          "objectKey": ""
        },
        {
          "value": "variables.data",
          "apiName": "data",
          "label": "Data",
          "type": "Variable",
          "dataType": "Object",
          "defaultValue": null,
          "isCollection": false,
          "availableInput": false,
          "availableOutput": true,
          "objectKey": ""
        }
      ],
      "actions": [
        {
          "id": "get_stores",
          "label": "Get Uber Eats Stores",
          "apiName": "get_stores",
          "key": "ONE_HTTP_REQUEST",
          "providerKey": "uber_eats",
          "method": "GET",
          "endpoint": "/v1/eats/stores"
        },
        {
          "id": "check_result",
          "label": "Request Successful?",
          "apiName": "check_result",
          "key": "CONDITION",
          "outcomes": [
            {
              "id": "yes",
              "label": "Success",
              "condition": {
                "match": "all",
                "conditions": [
                  {
                    "field": "steps.get_stores.success",
                    "operator": "equals",
                    "value": true
                  }
                ]
              },
              "branch": [
                "set_success",
                "set_response"
              ]
            }
          ],
          "defaultLabel": "Failed",
          "defaultBranch": [
            "set_failed",
            "set_error"
          ]
        },
        {
          "id": "set_success",
          "label": "Set Success",
          "apiName": "set_success",
          "key": "ASSIGNMENT",
          "variableName": "success",
          "variableType": "boolean",
          "operator": "set",
          "value": true
        },
        {
          "id": "set_response",
          "label": "Set Response",
          "apiName": "set_response",
          "key": "ASSIGNMENT",
          "variableName": "data",
          "variableType": "object",
          "operator": "set",
          "value": {
            "path": "steps.get_stores.data"
          }
        },
        {
          "id": "set_failed",
          "label": "Set Failed",
          "apiName": "set_failed",
          "key": "ASSIGNMENT",
          "variableName": "success",
          "variableType": "boolean",
          "operator": "set",
          "value": false
        },
        {
          "id": "set_error",
          "label": "Set Error",
          "apiName": "set_error",
          "key": "ASSIGNMENT",
          "variableName": "data",
          "variableType": "object",
          "operator": "set",
          "value": {
            "path": "steps.get_stores.data"
          }
        }
      ]
    }
  },
  {
    "objectKey": "uber_eats_connection",
    "name": "GPT - Uber Eats - Test Connection",
    "triggerKey": "manual",
    "active": true,
    "lifecycleStatus": "ACTIVE",
    "action": {
      "type": "workflow",
      "scope": "uber_eats",
      "flowType": "AUTOLAUNCHED",
      "apiName": "GPT_UBER_EATS_TEST_CONNECTION",
      "capabilityKey": "GPT_UBER_EATS_TEST_CONNECTION",
      "inputContract": [],
      "outputContract": [
        {
          "name": "success",
          "type": "boolean",
          "source": "variables.success"
        },
        {
          "name": "data",
          "type": "object",
          "source": "variables.data"
        }
      ],
      "resources": [
        {
          "value": "variables.success",
          "apiName": "success",
          "label": "Success",
          "type": "Variable",
          "dataType": "Boolean",
          "defaultValue": false,
          "isCollection": false,
          "availableInput": false,
          "availableOutput": true,
          "objectKey": ""
        },
        {
          "value": "variables.data",
          "apiName": "data",
          "label": "Data",
          "type": "Variable",
          "dataType": "Object",
          "defaultValue": null,
          "isCollection": false,
          "availableInput": false,
          "availableOutput": true,
          "objectKey": ""
        }
      ],
      "actions": [
        {
          "id": "test_connection",
          "label": "Test Uber Eats Connection",
          "apiName": "test_connection",
          "key": "ONE_HTTP_REQUEST",
          "providerKey": "uber_eats",
          "method": "GET",
          "endpoint": "/v1/eats/stores"
        },
        {
          "id": "check_result",
          "label": "Request Successful?",
          "apiName": "check_result",
          "key": "CONDITION",
          "outcomes": [
            {
              "id": "yes",
              "label": "Success",
              "condition": {
                "match": "all",
                "conditions": [
                  {
                    "field": "steps.test_connection.success",
                    "operator": "equals",
                    "value": true
                  }
                ]
              },
              "branch": [
                "set_success",
                "set_response"
              ]
            }
          ],
          "defaultLabel": "Failed",
          "defaultBranch": [
            "set_failed",
            "set_error"
          ]
        },
        {
          "id": "set_success",
          "label": "Set Success",
          "apiName": "set_success",
          "key": "ASSIGNMENT",
          "variableName": "success",
          "variableType": "boolean",
          "operator": "set",
          "value": true
        },
        {
          "id": "set_response",
          "label": "Set Response",
          "apiName": "set_response",
          "key": "ASSIGNMENT",
          "variableName": "data",
          "variableType": "object",
          "operator": "set",
          "value": {
            "path": "steps.test_connection.data"
          }
        },
        {
          "id": "set_failed",
          "label": "Set Failed",
          "apiName": "set_failed",
          "key": "ASSIGNMENT",
          "variableName": "success",
          "variableType": "boolean",
          "operator": "set",
          "value": false
        },
        {
          "id": "set_error",
          "label": "Set Error",
          "apiName": "set_error",
          "key": "ASSIGNMENT",
          "variableName": "data",
          "variableType": "object",
          "operator": "set",
          "value": {
            "path": "steps.test_connection.data"
          }
        }
      ]
    }
  },
  {
    "objectKey": "uber_eats_connection",
    "name": "GPT - Uber Eats - Upload Menu",
    "triggerKey": "manual",
    "active": true,
    "lifecycleStatus": "ACTIVE",
    "action": {
      "type": "workflow",
      "scope": "uber_eats",
      "flowType": "AUTOLAUNCHED",
      "apiName": "GPT_UBER_EATS_UPLOAD_MENU",
      "capabilityKey": "GPT_UBER_EATS_UPLOAD_MENU",
      "inputContract": [
        {
          "name": "storeId",
          "type": "text",
          "required": false
        }
      ],
      "outputContract": [
        {
          "name": "success",
          "type": "boolean",
          "source": "variables.success"
        },
        {
          "name": "data",
          "type": "object",
          "source": "variables.data"
        }
      ],
      "resources": [
        {
          "value": "variables.storeId",
          "apiName": "storeId",
          "label": "Store ID",
          "type": "Variable",
          "dataType": "Text",
          "defaultValue": "",
          "isCollection": false,
          "availableInput": true,
          "availableOutput": false,
          "objectKey": ""
        },
        {
          "value": "variables.success",
          "apiName": "success",
          "label": "Success",
          "type": "Variable",
          "dataType": "Boolean",
          "defaultValue": false,
          "isCollection": false,
          "availableInput": false,
          "availableOutput": true,
          "objectKey": ""
        },
        {
          "value": "variables.data",
          "apiName": "data",
          "label": "Data",
          "type": "Variable",
          "dataType": "Object",
          "defaultValue": null,
          "isCollection": false,
          "availableInput": false,
          "availableOutput": true,
          "objectKey": ""
        }
      ],
      "actions": [
        {
          "id": "get_products",
          "label": "Get Uber-enabled Products",
          "apiName": "get_products",
          "key": "GET_RECORDS",
          "objectKey": "product",
          "filters": [
            {
              "field": "available_on_uber",
              "operator": "equals",
              "value": true
            },
            {
              "field": "active",
              "operator": "equals",
              "value": true
            }
          ],
          "match": "all",
          "store": "all",
          "limit": 500,
          "fieldSelection": "choose",
          "selectedFields": [
            "id",
            "name",
            "description",
            "price",
            "vat_rate",
            "uber_item_id",
            "category_id"
          ]
        },
        {
          "id": "build_items",
          "label": "Build Uber Items",
          "apiName": "build_items",
          "key": "TRANSFORM",
          "collection": "steps.get_products.records",
          "transformMappings": {
            "id": {
              "coalesce": [
                "item.uber_item_id",
                "item.id"
              ]
            },
            "title": {
              "translations": {
                "en_us": {
                  "path": "$record.name"
                }
              }
            },
            "description": {
              "translations": {
                "en_us": {
                  "path": "$record.description"
                }
              }
            },
            "external_data": "item.id",
            "price_info": {
              "price": {
                "source": "item.price",
                "multiply": 100,
                "round": true
              }
            },
            "tax_info": {
              "vat_rate_percentage": "item.vat_rate"
            }
          }
        },
        {
          "id": "build_categories",
          "label": "Build Uber Categories",
          "apiName": "build_categories",
          "key": "TRANSFORM",
          "collection": "steps.get_products.records",
          "transformMappings": {
            "id": "item.id",
            "title": {
              "translations": {
                "en_us": {
                  "path": "$record.name"
                }
              }
            },
            "entities": [
              {
                "id": {
                  "path": "$record.uber_item_id",
                  "fallback": {
                    "path": "$record.id"
                  }
                },
                "type": "ITEM"
              }
            ]
          }
        },
        {
          "id": "build_category_ids",
          "label": "Build Category IDs",
          "apiName": "build_category_ids",
          "key": "TRANSFORM",
          "collection": "steps.get_products.records",
          "outputValue": "item.id"
        },
        {
          "id": "upload_menu",
          "label": "Upload Uber Eats Menu",
          "apiName": "upload_menu",
          "key": "ONE_HTTP_REQUEST",
          "providerKey": "uber_eats",
          "method": "PUT",
          "endpoint": "/v2/eats/stores/{{storeId}}/menus",
          "body": {
            "menus": [
              {
                "id": "onepos-menu",
                "title": {
                  "translations": {
                    "en_us": "onePOS Menu"
                  }
                },
                "service_availability": [
                  {
                    "day_of_week": "monday",
                    "time_periods": [
                      {
                        "start_time": "00:00",
                        "end_time": "23:59"
                      }
                    ]
                  },
                  {
                    "day_of_week": "tuesday",
                    "time_periods": [
                      {
                        "start_time": "00:00",
                        "end_time": "23:59"
                      }
                    ]
                  },
                  {
                    "day_of_week": "wednesday",
                    "time_periods": [
                      {
                        "start_time": "00:00",
                        "end_time": "23:59"
                      }
                    ]
                  },
                  {
                    "day_of_week": "thursday",
                    "time_periods": [
                      {
                        "start_time": "00:00",
                        "end_time": "23:59"
                      }
                    ]
                  },
                  {
                    "day_of_week": "friday",
                    "time_periods": [
                      {
                        "start_time": "00:00",
                        "end_time": "23:59"
                      }
                    ]
                  },
                  {
                    "day_of_week": "saturday",
                    "time_periods": [
                      {
                        "start_time": "00:00",
                        "end_time": "23:59"
                      }
                    ]
                  },
                  {
                    "day_of_week": "sunday",
                    "time_periods": [
                      {
                        "start_time": "00:00",
                        "end_time": "23:59"
                      }
                    ]
                  }
                ],
                "category_ids": {
                  "path": "steps.build_category_ids.collection"
                }
              }
            ],
            "categories": {
              "path": "steps.build_categories.collection"
            },
            "items": {
              "path": "steps.build_items.collection"
            },
            "modifier_groups": [],
            "display_options": {
              "disable_item_instructions": true
            }
          }
        },
        {
          "id": "check_result",
          "label": "Menu Upload Successful?",
          "apiName": "check_result",
          "key": "CONDITION",
          "outcomes": [
            {
              "id": "yes",
              "label": "Success",
              "condition": {
                "match": "all",
                "conditions": [
                  {
                    "field": "steps.upload_menu.success",
                    "operator": "equals",
                    "value": true
                  }
                ]
              },
              "branch": [
                "set_success",
                "set_data"
              ]
            }
          ],
          "defaultLabel": "Failed",
          "defaultBranch": [
            "set_failed",
            "set_error"
          ]
        },
        {
          "id": "set_success",
          "label": "Set Success",
          "apiName": "set_success",
          "key": "ASSIGNMENT",
          "variableName": "success",
          "variableType": "boolean",
          "operator": "set",
          "value": true
        },
        {
          "id": "set_data",
          "label": "Set Data",
          "apiName": "set_data",
          "key": "ASSIGNMENT",
          "variableName": "data",
          "variableType": "object",
          "operator": "set",
          "value": {
            "path": "steps.upload_menu.data"
          }
        },
        {
          "id": "set_failed",
          "label": "Set Failed",
          "apiName": "set_failed",
          "key": "ASSIGNMENT",
          "variableName": "success",
          "variableType": "boolean",
          "operator": "set",
          "value": false
        },
        {
          "id": "set_error",
          "label": "Set Error",
          "apiName": "set_error",
          "key": "ASSIGNMENT",
          "variableName": "data",
          "variableType": "object",
          "operator": "set",
          "value": {
            "path": "steps.upload_menu.data"
          }
        }
      ]
    }
  },
  {
    "objectKey": "online_order",
    "name": "GPT - Uber Eats - Accept Order",
    "triggerKey": "manual",
    "active": true,
    "lifecycleStatus": "ACTIVE",
    "action": {
      "type": "workflow",
      "scope": "uber_eats",
      "flowType": "AUTOLAUNCHED",
      "apiName": "GPT_UBER_EATS_ACCEPT_ORDER",
      "capabilityKey": "GPT_UBER_EATS_ACCEPT_ORDER",
      "inputContract": [
        {
          "name": "orderId",
          "type": "text",
          "required": true
        }
      ],
      "outputContract": [
        {
          "name": "success",
          "type": "boolean",
          "source": "variables.success"
        },
        {
          "name": "data",
          "type": "object",
          "source": "variables.data"
        }
      ],
      "resources": [
        {
          "value": "variables.orderId",
          "apiName": "orderId",
          "label": "orderId",
          "type": "Variable",
          "dataType": "Text",
          "defaultValue": "",
          "isCollection": false,
          "availableInput": true,
          "availableOutput": false,
          "objectKey": ""
        },
        {
          "value": "variables.success",
          "apiName": "success",
          "label": "Success",
          "type": "Variable",
          "dataType": "Boolean",
          "defaultValue": false,
          "isCollection": false,
          "availableInput": false,
          "availableOutput": true,
          "objectKey": ""
        },
        {
          "value": "variables.data",
          "apiName": "data",
          "label": "Data",
          "type": "Variable",
          "dataType": "Object",
          "defaultValue": null,
          "isCollection": false,
          "availableInput": false,
          "availableOutput": true,
          "objectKey": ""
        }
      ],
      "actions": [
        {
          "id": "accept_order",
          "label": "Accept Uber Eats Order",
          "apiName": "accept_order",
          "key": "ONE_HTTP_REQUEST",
          "providerKey": "uber_eats",
          "method": "POST",
          "endpoint": "/v1/eats/orders/{{orderId}}/accept_pos_order",
          "body": {
            "reason": "Accepted by POS"
          }
        },
        {
          "id": "check_result",
          "label": "Request Successful?",
          "apiName": "check_result",
          "key": "CONDITION",
          "outcomes": [
            {
              "id": "yes",
              "label": "Success",
              "condition": {
                "match": "all",
                "conditions": [
                  {
                    "field": "steps.accept_order.success",
                    "operator": "equals",
                    "value": true
                  }
                ]
              },
              "branch": [
                "set_success",
                "set_response"
              ]
            }
          ],
          "defaultLabel": "Failed",
          "defaultBranch": [
            "set_failed",
            "set_error"
          ]
        },
        {
          "id": "set_success",
          "label": "Set Success",
          "apiName": "set_success",
          "key": "ASSIGNMENT",
          "variableName": "success",
          "variableType": "boolean",
          "operator": "set",
          "value": true
        },
        {
          "id": "set_response",
          "label": "Set Response",
          "apiName": "set_response",
          "key": "ASSIGNMENT",
          "variableName": "data",
          "variableType": "object",
          "operator": "set",
          "value": {
            "path": "steps.accept_order.data"
          }
        },
        {
          "id": "set_failed",
          "label": "Set Failed",
          "apiName": "set_failed",
          "key": "ASSIGNMENT",
          "variableName": "success",
          "variableType": "boolean",
          "operator": "set",
          "value": false
        },
        {
          "id": "set_error",
          "label": "Set Error",
          "apiName": "set_error",
          "key": "ASSIGNMENT",
          "variableName": "data",
          "variableType": "object",
          "operator": "set",
          "value": {
            "path": "steps.accept_order.data"
          }
        }
      ]
    }
  },
  {
    "objectKey": "online_order",
    "name": "GPT - Uber Eats - Deny Order",
    "triggerKey": "manual",
    "active": true,
    "lifecycleStatus": "ACTIVE",
    "action": {
      "type": "workflow",
      "scope": "uber_eats",
      "flowType": "AUTOLAUNCHED",
      "apiName": "GPT_UBER_EATS_DENY_ORDER",
      "capabilityKey": "GPT_UBER_EATS_DENY_ORDER",
      "inputContract": [
        {
          "name": "orderId",
          "type": "text",
          "required": true
        },
        {
          "name": "reason",
          "type": "text",
          "required": false
        }
      ],
      "outputContract": [
        {
          "name": "success",
          "type": "boolean",
          "source": "variables.success"
        },
        {
          "name": "data",
          "type": "object",
          "source": "variables.data"
        }
      ],
      "resources": [
        {
          "value": "variables.orderId",
          "apiName": "orderId",
          "label": "orderId",
          "type": "Variable",
          "dataType": "Text",
          "defaultValue": "",
          "isCollection": false,
          "availableInput": true,
          "availableOutput": false,
          "objectKey": ""
        },
        {
          "value": "variables.reason",
          "apiName": "reason",
          "label": "reason",
          "type": "Variable",
          "dataType": "Text",
          "defaultValue": "",
          "isCollection": false,
          "availableInput": true,
          "availableOutput": false,
          "objectKey": ""
        },
        {
          "value": "variables.success",
          "apiName": "success",
          "label": "Success",
          "type": "Variable",
          "dataType": "Boolean",
          "defaultValue": false,
          "isCollection": false,
          "availableInput": false,
          "availableOutput": true,
          "objectKey": ""
        },
        {
          "value": "variables.data",
          "apiName": "data",
          "label": "Data",
          "type": "Variable",
          "dataType": "Object",
          "defaultValue": null,
          "isCollection": false,
          "availableInput": false,
          "availableOutput": true,
          "objectKey": ""
        }
      ],
      "actions": [
        {
          "id": "deny_order",
          "label": "Deny Uber Eats Order",
          "apiName": "deny_order",
          "key": "ONE_HTTP_REQUEST",
          "providerKey": "uber_eats",
          "method": "POST",
          "endpoint": "/v1/eats/orders/{{orderId}}/deny_pos_order",
          "body": {
            "reason": {
              "explanation": {
                "path": "variables.reason"
              },
              "code": "OTHER"
            }
          }
        },
        {
          "id": "check_result",
          "label": "Request Successful?",
          "apiName": "check_result",
          "key": "CONDITION",
          "outcomes": [
            {
              "id": "yes",
              "label": "Success",
              "condition": {
                "match": "all",
                "conditions": [
                  {
                    "field": "steps.deny_order.success",
                    "operator": "equals",
                    "value": true
                  }
                ]
              },
              "branch": [
                "set_success",
                "set_response"
              ]
            }
          ],
          "defaultLabel": "Failed",
          "defaultBranch": [
            "set_failed",
            "set_error"
          ]
        },
        {
          "id": "set_success",
          "label": "Set Success",
          "apiName": "set_success",
          "key": "ASSIGNMENT",
          "variableName": "success",
          "variableType": "boolean",
          "operator": "set",
          "value": true
        },
        {
          "id": "set_response",
          "label": "Set Response",
          "apiName": "set_response",
          "key": "ASSIGNMENT",
          "variableName": "data",
          "variableType": "object",
          "operator": "set",
          "value": {
            "path": "steps.deny_order.data"
          }
        },
        {
          "id": "set_failed",
          "label": "Set Failed",
          "apiName": "set_failed",
          "key": "ASSIGNMENT",
          "variableName": "success",
          "variableType": "boolean",
          "operator": "set",
          "value": false
        },
        {
          "id": "set_error",
          "label": "Set Error",
          "apiName": "set_error",
          "key": "ASSIGNMENT",
          "variableName": "data",
          "variableType": "object",
          "operator": "set",
          "value": {
            "path": "steps.deny_order.data"
          }
        }
      ]
    }
  },
  {
    "objectKey": "product",
    "name": "GPT - Uber Eats - Update Item Price",
    "triggerKey": "manual",
    "active": true,
    "lifecycleStatus": "ACTIVE",
    "action": {
      "type": "workflow",
      "scope": "uber_eats",
      "flowType": "AUTOLAUNCHED",
      "apiName": "GPT_UBER_EATS_UPDATE_ITEM_PRICE",
      "capabilityKey": "GPT_UBER_EATS_UPDATE_ITEM_PRICE",
      "inputContract": [
        {
          "name": "storeId",
          "type": "text",
          "required": true
        },
        {
          "name": "itemId",
          "type": "text",
          "required": true
        },
        {
          "name": "price",
          "type": "number",
          "required": true
        }
      ],
      "outputContract": [
        {
          "name": "success",
          "type": "boolean",
          "source": "variables.success"
        },
        {
          "name": "data",
          "type": "object",
          "source": "variables.data"
        }
      ],
      "resources": [
        {
          "value": "variables.storeId",
          "apiName": "storeId",
          "label": "storeId",
          "type": "Variable",
          "dataType": "Text",
          "defaultValue": "",
          "isCollection": false,
          "availableInput": true,
          "availableOutput": false,
          "objectKey": ""
        },
        {
          "value": "variables.itemId",
          "apiName": "itemId",
          "label": "itemId",
          "type": "Variable",
          "dataType": "Text",
          "defaultValue": "",
          "isCollection": false,
          "availableInput": true,
          "availableOutput": false,
          "objectKey": ""
        },
        {
          "value": "variables.price",
          "apiName": "price",
          "label": "price",
          "type": "Variable",
          "dataType": "Number",
          "defaultValue": null,
          "isCollection": false,
          "availableInput": true,
          "availableOutput": false,
          "objectKey": ""
        },
        {
          "value": "variables.success",
          "apiName": "success",
          "label": "Success",
          "type": "Variable",
          "dataType": "Boolean",
          "defaultValue": false,
          "isCollection": false,
          "availableInput": false,
          "availableOutput": true,
          "objectKey": ""
        },
        {
          "value": "variables.data",
          "apiName": "data",
          "label": "Data",
          "type": "Variable",
          "dataType": "Object",
          "defaultValue": null,
          "isCollection": false,
          "availableInput": false,
          "availableOutput": true,
          "objectKey": ""
        }
      ],
      "actions": [
        {
          "id": "calculate_price_minor",
          "label": "Calculate Minor Unit Price",
          "apiName": "calculate_price_minor",
          "key": "FORMULA",
          "resourceName": "priceMinor",
          "resultType": "number",
          "expression": "price * 100",
          "inputs": {
            "price": {
              "path": "variables.price"
            }
          }
        },
        {
          "id": "update_price",
          "label": "Update Uber Eats Item Price",
          "apiName": "update_price",
          "key": "ONE_HTTP_REQUEST",
          "providerKey": "uber_eats",
          "method": "POST",
          "endpoint": "/v2/eats/stores/{{storeId}}/menus/items/{{itemId}}",
          "body": {
            "price_info": {
              "price": {
                "path": "variables.priceMinor"
              },
              "overrides": []
            }
          }
        },
        {
          "id": "check_result",
          "label": "Request Successful?",
          "apiName": "check_result",
          "key": "CONDITION",
          "outcomes": [
            {
              "id": "yes",
              "label": "Success",
              "condition": {
                "match": "all",
                "conditions": [
                  {
                    "field": "steps.update_price.success",
                    "operator": "equals",
                    "value": true
                  }
                ]
              },
              "branch": [
                "set_success",
                "set_response"
              ]
            }
          ],
          "defaultLabel": "Failed",
          "defaultBranch": [
            "set_failed",
            "set_error"
          ]
        },
        {
          "id": "set_success",
          "label": "Set Success",
          "apiName": "set_success",
          "key": "ASSIGNMENT",
          "variableName": "success",
          "variableType": "boolean",
          "operator": "set",
          "value": true
        },
        {
          "id": "set_response",
          "label": "Set Response",
          "apiName": "set_response",
          "key": "ASSIGNMENT",
          "variableName": "data",
          "variableType": "object",
          "operator": "set",
          "value": {
            "path": "steps.update_price.data"
          }
        },
        {
          "id": "set_failed",
          "label": "Set Failed",
          "apiName": "set_failed",
          "key": "ASSIGNMENT",
          "variableName": "success",
          "variableType": "boolean",
          "operator": "set",
          "value": false
        },
        {
          "id": "set_error",
          "label": "Set Error",
          "apiName": "set_error",
          "key": "ASSIGNMENT",
          "variableName": "data",
          "variableType": "object",
          "operator": "set",
          "value": {
            "path": "steps.update_price.data"
          }
        }
      ]
    }
  },
  {
    "objectKey": "product",
    "name": "GPT - Uber Eats - Set Item Unavailable",
    "triggerKey": "manual",
    "active": true,
    "lifecycleStatus": "ACTIVE",
    "action": {
      "type": "workflow",
      "scope": "uber_eats",
      "flowType": "AUTOLAUNCHED",
      "apiName": "GPT_UBER_EATS_SET_ITEM_UNAVAILABLE",
      "capabilityKey": "GPT_UBER_EATS_SET_ITEM_UNAVAILABLE",
      "inputContract": [
        {
          "name": "storeId",
          "type": "text",
          "required": true
        },
        {
          "name": "itemId",
          "type": "text",
          "required": true
        },
        {
          "name": "suspendUntil",
          "type": "number",
          "required": true
        }
      ],
      "outputContract": [
        {
          "name": "success",
          "type": "boolean",
          "source": "variables.success"
        },
        {
          "name": "data",
          "type": "object",
          "source": "variables.data"
        }
      ],
      "resources": [
        {
          "value": "variables.storeId",
          "apiName": "storeId",
          "label": "storeId",
          "type": "Variable",
          "dataType": "Text",
          "defaultValue": "",
          "isCollection": false,
          "availableInput": true,
          "availableOutput": false,
          "objectKey": ""
        },
        {
          "value": "variables.itemId",
          "apiName": "itemId",
          "label": "itemId",
          "type": "Variable",
          "dataType": "Text",
          "defaultValue": "",
          "isCollection": false,
          "availableInput": true,
          "availableOutput": false,
          "objectKey": ""
        },
        {
          "value": "variables.suspendUntil",
          "apiName": "suspendUntil",
          "label": "Suspend Until",
          "type": "Variable",
          "dataType": "Number",
          "defaultValue": null,
          "isCollection": false,
          "availableInput": true,
          "availableOutput": false,
          "objectKey": ""
        },
        {
          "value": "variables.success",
          "apiName": "success",
          "label": "Success",
          "type": "Variable",
          "dataType": "Boolean",
          "defaultValue": false,
          "isCollection": false,
          "availableInput": false,
          "availableOutput": true,
          "objectKey": ""
        },
        {
          "value": "variables.data",
          "apiName": "data",
          "label": "Data",
          "type": "Variable",
          "dataType": "Object",
          "defaultValue": null,
          "isCollection": false,
          "availableInput": false,
          "availableOutput": true,
          "objectKey": ""
        }
      ],
      "actions": [
        {
          "id": "set_unavailable",
          "label": "Set Uber Eats Item Unavailable",
          "apiName": "set_unavailable",
          "key": "ONE_HTTP_REQUEST",
          "providerKey": "uber_eats",
          "method": "POST",
          "endpoint": "/v2/eats/stores/{{storeId}}/menus/items/{{itemId}}",
          "body": {
            "suspension_info": {
              "suspension": {
                "suspend_until": {
                  "path": "variables.suspendUntil"
                },
                "reason": "Out of stock"
              }
            }
          }
        },
        {
          "id": "check_result",
          "label": "Request Successful?",
          "apiName": "check_result",
          "key": "CONDITION",
          "outcomes": [
            {
              "id": "yes",
              "label": "Success",
              "condition": {
                "match": "all",
                "conditions": [
                  {
                    "field": "steps.set_unavailable.success",
                    "operator": "equals",
                    "value": true
                  }
                ]
              },
              "branch": [
                "set_success",
                "set_response"
              ]
            }
          ],
          "defaultLabel": "Failed",
          "defaultBranch": [
            "set_failed",
            "set_error"
          ]
        },
        {
          "id": "set_success",
          "label": "Set Success",
          "apiName": "set_success",
          "key": "ASSIGNMENT",
          "variableName": "success",
          "variableType": "boolean",
          "operator": "set",
          "value": true
        },
        {
          "id": "set_response",
          "label": "Set Response",
          "apiName": "set_response",
          "key": "ASSIGNMENT",
          "variableName": "data",
          "variableType": "object",
          "operator": "set",
          "value": {
            "path": "steps.set_unavailable.data"
          }
        },
        {
          "id": "set_failed",
          "label": "Set Failed",
          "apiName": "set_failed",
          "key": "ASSIGNMENT",
          "variableName": "success",
          "variableType": "boolean",
          "operator": "set",
          "value": false
        },
        {
          "id": "set_error",
          "label": "Set Error",
          "apiName": "set_error",
          "key": "ASSIGNMENT",
          "variableName": "data",
          "variableType": "object",
          "operator": "set",
          "value": {
            "path": "steps.set_unavailable.data"
          }
        }
      ]
    }
  },
  {
    "objectKey": "product",
    "name": "GPT - Uber Eats - Set Item Available",
    "triggerKey": "manual",
    "active": true,
    "lifecycleStatus": "ACTIVE",
    "action": {
      "type": "workflow",
      "scope": "uber_eats",
      "flowType": "AUTOLAUNCHED",
      "apiName": "GPT_UBER_EATS_SET_ITEM_AVAILABLE",
      "capabilityKey": "GPT_UBER_EATS_SET_ITEM_AVAILABLE",
      "inputContract": [
        {
          "name": "storeId",
          "type": "text",
          "required": true
        },
        {
          "name": "itemId",
          "type": "text",
          "required": true
        }
      ],
      "outputContract": [
        {
          "name": "success",
          "type": "boolean",
          "source": "variables.success"
        },
        {
          "name": "data",
          "type": "object",
          "source": "variables.data"
        }
      ],
      "resources": [
        {
          "value": "variables.storeId",
          "apiName": "storeId",
          "label": "storeId",
          "type": "Variable",
          "dataType": "Text",
          "defaultValue": "",
          "isCollection": false,
          "availableInput": true,
          "availableOutput": false,
          "objectKey": ""
        },
        {
          "value": "variables.itemId",
          "apiName": "itemId",
          "label": "itemId",
          "type": "Variable",
          "dataType": "Text",
          "defaultValue": "",
          "isCollection": false,
          "availableInput": true,
          "availableOutput": false,
          "objectKey": ""
        },
        {
          "value": "variables.success",
          "apiName": "success",
          "label": "Success",
          "type": "Variable",
          "dataType": "Boolean",
          "defaultValue": false,
          "isCollection": false,
          "availableInput": false,
          "availableOutput": true,
          "objectKey": ""
        },
        {
          "value": "variables.data",
          "apiName": "data",
          "label": "Data",
          "type": "Variable",
          "dataType": "Object",
          "defaultValue": null,
          "isCollection": false,
          "availableInput": false,
          "availableOutput": true,
          "objectKey": ""
        }
      ],
      "actions": [
        {
          "id": "set_available",
          "label": "Set Uber Eats Item Available",
          "apiName": "set_available",
          "key": "ONE_HTTP_REQUEST",
          "providerKey": "uber_eats",
          "method": "POST",
          "endpoint": "/v2/eats/stores/{{storeId}}/menus/items/{{itemId}}",
          "body": {
            "suspension_info": {
              "suspension": {
                "suspend_until": null
              }
            }
          }
        },
        {
          "id": "check_result",
          "label": "Request Successful?",
          "apiName": "check_result",
          "key": "CONDITION",
          "outcomes": [
            {
              "id": "yes",
              "label": "Success",
              "condition": {
                "match": "all",
                "conditions": [
                  {
                    "field": "steps.set_available.success",
                    "operator": "equals",
                    "value": true
                  }
                ]
              },
              "branch": [
                "set_success",
                "set_response"
              ]
            }
          ],
          "defaultLabel": "Failed",
          "defaultBranch": [
            "set_failed",
            "set_error"
          ]
        },
        {
          "id": "set_success",
          "label": "Set Success",
          "apiName": "set_success",
          "key": "ASSIGNMENT",
          "variableName": "success",
          "variableType": "boolean",
          "operator": "set",
          "value": true
        },
        {
          "id": "set_response",
          "label": "Set Response",
          "apiName": "set_response",
          "key": "ASSIGNMENT",
          "variableName": "data",
          "variableType": "object",
          "operator": "set",
          "value": {
            "path": "steps.set_available.data"
          }
        },
        {
          "id": "set_failed",
          "label": "Set Failed",
          "apiName": "set_failed",
          "key": "ASSIGNMENT",
          "variableName": "success",
          "variableType": "boolean",
          "operator": "set",
          "value": false
        },
        {
          "id": "set_error",
          "label": "Set Error",
          "apiName": "set_error",
          "key": "ASSIGNMENT",
          "variableName": "data",
          "variableType": "object",
          "operator": "set",
          "value": {
            "path": "steps.set_available.data"
          }
        }
      ]
    }
  }
];

export const packageRegistrySchema = `
  CREATE TABLE IF NOT EXISTS package_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    package_key VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(200) NOT NULL,
    version VARCHAR(40) NOT NULL DEFAULT '1.0.0',
    description TEXT,
    module_id UUID UNIQUE REFERENCES platform_modules(id) ON DELETE SET NULL,
    manifest JSONB NOT NULL DEFAULT '{}'::jsonb,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    package_type VARCHAR(30) NOT NULL DEFAULT 'APPLICATION',
    publisher VARCHAR(200) NOT NULL DEFAULT 'OneSolutions',
    category VARCHAR(100),
    required_platform_version VARCHAR(40),
    publication_state VARCHAR(20) NOT NULL DEFAULT 'PUBLISHED',
    visible BOOLEAN NOT NULL DEFAULT TRUE,
    installable BOOLEAN NOT NULL DEFAULT TRUE,
    billable BOOLEAN NOT NULL DEFAULT TRUE,
    featured BOOLEAN NOT NULL DEFAULT FALSE,
    system_only BOOLEAN NOT NULL DEFAULT FALSE,
    display_order INTEGER NOT NULL DEFAULT 0,
    available_tiers JSONB NOT NULL DEFAULT '[]'::jsonb,
    licence_mode VARCHAR(30) NOT NULL DEFAULT 'COMMERCIAL',
    allowed_bundles TEXT[] NOT NULL DEFAULT '{}',
    allowed_companies UUID[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  ALTER TABLE package_registry ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT FALSE;
  CREATE TABLE IF NOT EXISTS package_dependencies (
    package_id UUID NOT NULL REFERENCES package_registry(id) ON DELETE CASCADE,
    dependency_id UUID NOT NULL REFERENCES package_registry(id) ON DELETE RESTRICT,
    version_range VARCHAR(40),
    min_version VARCHAR(40),
    max_version VARCHAR(40),
    optional BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (package_id, dependency_id),
    CHECK (package_id <> dependency_id)
  );
  CREATE TABLE IF NOT EXISTS company_package_installations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    package_id UUID NOT NULL REFERENCES package_registry(id) ON DELETE RESTRICT,
    version VARCHAR(40) NOT NULL,
    selected_features JSONB NOT NULL DEFAULT '[]'::jsonb,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
    installation_type VARCHAR(30) NOT NULL DEFAULT 'DIRECT',
    available_version VARCHAR(40),
    last_upgrade_at TIMESTAMPTZ,
    last_upgrade_state VARCHAR(20) NOT NULL DEFAULT 'READY',
    suspended_by_entitlement BOOLEAN NOT NULL DEFAULT FALSE,
    deactivated_by_user BOOLEAN NOT NULL DEFAULT FALSE,
    installed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, package_id)
  );
  ALTER TABLE company_package_installations
    ADD COLUMN IF NOT EXISTS selected_features JSONB NOT NULL DEFAULT '[]'::jsonb;
  CREATE INDEX IF NOT EXISTS idx_company_package_installations_company
    ON company_package_installations(company_id, status);
  CREATE TABLE IF NOT EXISTS package_installation_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    package_id UUID NOT NULL REFERENCES package_registry(id) ON DELETE RESTRICT,
    version VARCHAR(40) NOT NULL,
    migration_key VARCHAR(200) NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    applied_by UUID REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE (company_id, package_id, version, migration_key)
  );
  CREATE INDEX IF NOT EXISTS idx_package_installation_versions_company
    ON package_installation_versions(company_id, package_id, applied_at DESC);
  CREATE TABLE IF NOT EXISTS package_installation_operations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    idempotency_key VARCHAR(200) NOT NULL,
    operation VARCHAR(20) NOT NULL CHECK (operation IN ('install','uninstall','deactivate')),
    package_key VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('completed','failed')),
    response JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, idempotency_key, operation, package_key)
  );
  ALTER TABLE package_installation_operations
    DROP CONSTRAINT IF EXISTS package_installation_operations_company_id_idempotency_key_operation_key;
  CREATE UNIQUE INDEX IF NOT EXISTS uq_package_installation_operations_key
    ON package_installation_operations(company_id, idempotency_key, operation, package_key);

  CREATE TABLE IF NOT EXISTS package_releases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    package_key VARCHAR(100) NOT NULL,
    version VARCHAR(40) NOT NULL,
    previous_version VARCHAR(40),
    release_notes TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','VALIDATED','PUBLISHED','PAUSED','ARCHIVED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at TIMESTAMPTZ,
    published_by UUID REFERENCES users(id) ON DELETE SET NULL,
    minimum_platform_version VARCHAR(40),
    update_policy VARCHAR(20) NOT NULL DEFAULT 'OPTIONAL' CHECK (update_policy IN ('OPTIONAL','FORCED','STAGED')),
    change_set JSONB NOT NULL DEFAULT '[]'::jsonb,
    manifest JSONB NOT NULL DEFAULT '{}'::jsonb,
    validation_summary JSONB NOT NULL DEFAULT '{}'::jsonb
  );
  ALTER TABLE package_releases ADD COLUMN IF NOT EXISTS manifest JSONB NOT NULL DEFAULT '{}'::jsonb;
  CREATE INDEX IF NOT EXISTS idx_package_releases_package_status
    ON package_releases(package_key, status, published_at DESC);

  ALTER TABLE company_package_installations
    ADD COLUMN IF NOT EXISTS installed_version VARCHAR(40),
    ADD COLUMN IF NOT EXISTS target_version VARCHAR(40),
    ADD COLUMN IF NOT EXISTS update_status VARCHAR(30) NOT NULL DEFAULT 'CURRENT'
      CHECK (update_status IN ('CURRENT','UPDATE_AVAILABLE','QUEUED','UPDATING','FAILED','CONFLICT','CURRENT_AFTER_UPDATE','ROLLBACK_REQUIRED')),
    ADD COLUMN IF NOT EXISTS last_update_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS update_error TEXT,
    ADD COLUMN IF NOT EXISTS auto_update_policy VARCHAR(20) NOT NULL DEFAULT 'OPTIONAL'
      CHECK (auto_update_policy IN ('OPTIONAL','FORCED','STAGED'));

  ALTER TABLE company_package_installations
    DROP CONSTRAINT IF EXISTS company_package_installations_update_status_check;
  ALTER TABLE company_package_installations
    ADD CONSTRAINT company_package_installations_update_status_check
    CHECK (update_status IN ('CURRENT','UPDATE_AVAILABLE','QUEUED','UPDATING','FAILED','CONFLICT','CURRENT_AFTER_UPDATE','ROLLBACK_REQUIRED'));

  UPDATE company_package_installations
     SET installed_version = version,
         target_version = version,
         update_status = CASE WHEN status='active' THEN 'CURRENT' ELSE update_status END,
         auto_update_policy = COALESCE(auto_update_policy, 'OPTIONAL')
   WHERE installed_version IS NULL;
`;


export function packageDefinition(entry) {
  const iconAssetKeys = {
    uber_eats: "uber-eats",
    deliveroo: "deliveroo",
    xero: "xero",
    xero_accounting: "xero-accounting",
    sage: "sage",
    sage_accounting: "sage-business-cloud-accounting",
    quickbooks: "quickbooks",
    shopify: "shopify",
    just_eat: "just-eat",
    whatsapp: "whatsapp",
    whatsapp_connector: "whatsapp",
    whatsapp_assistant: "whatsapp",
    open_food_facts: null,
    upcitemdb: null,
    barcode_nest: null,
    go_upc: null,
  };
  const packageNames = {
    retail_pos: "OneSales",
    one_kiosk: "OneKiosk",
    products: "Product Core",
    inventory: "OneInventory",
    batch_expiry: "OneBatchExpiry",
    hospitality: "OneHospitality",
    kds: "OneKDS",
    customer_credit: "OneCustomerCredit",
    suppliers: "OnePurchase",
    customers: "OneCustomer",
    staff: "Staff Core",
    reports: "OneReport",
    platform: "OneDeveloper",
    online_orders: "OneOnline",
    integrations: "OneIntegrations",
    email_connector: "Email Connector",
    sms_connector: "SMS Connector",
    communication_core: "Communication Core",
    one_connect_dojo: "One Connect - Dojo",
    one_connect_sumup: "One Connect - SumUp",
    one_connect_square: "One Connect - Square",
    uber_eats: "Uber Eats",
    quickbooks: "QuickBooks",
    shopify: "Shopify",
    client_web_shop: "Client Web Shop",
    own_delivery: "Own Delivery",
    whatsapp: "WhatsApp",
    whatsapp_connector: "WhatsApp Connector",
    whatsapp_assistant: "WhatsApp Assistant",
    open_food_facts: "Open Food Facts Connector",
    upcitemdb: "UPCitemdb Connector",
    barcode_nest: "BarcodeNest Connector",
    go_upc: "Go-UPC Connector",
    supplier_core: "Supplier Core",
    purchasing_core: "Purchasing Core",
    loyalty: "Loyalty Core",
    finance_core: "Finance Core",
    paypal_qr: "PayPal QR Payment",
    one_connect_google: "Google Connect",
    smsgate_connector: "SMSGate",
    one_assistant: "OneAssistant",
    payment_reference: "Payment Reference",
    payment_connector_template: "Payment Connector Template",
    receipt_printer_connector_template: "Receipt Printer Connector Template",
    kitchen_printer_connector_template: "Kitchen Printer Connector Template",
    cash_drawer_connector_template: "Cash Drawer Connector Template",
    mobile_scanner_connector: "Mobile Scanner Connector",
    barcode_scanner_connector_template: "Barcode Scanner Connector Template",
  };
  const packageDescriptions = {
    retail_pos: "Sales, payments, returns and order processing.",
    one_kiosk: "Customer self-service ordering, payment handoff and collection-number workflow across food, retail and service environments.",
    products: "Technical foundation for the canonical Product and Category objects.",
    inventory: "Stock, replenishment and inventory movements.",
    batch_expiry: "Batch stock, expiry tracking and FEFO inventory controls.",
    hospitality: "Floor plans, tables and reservations.",
    kds: "Kitchen display tickets and preparation status.",
    customer_credit: "Customer credit accounts, payments and protected credit controls.",
    suppliers: "Suppliers and purchasing operations.",
    customers: "Customer records and customer activity.",
    staff: "Reusable employee and attendance foundations over existing user identities.",
    reports: "Operational and custom report administration.",
    platform: "Developer workspace for configurable objects, metadata, apps and automation.",
    online_orders: "Online order intake and preparation.",
    integrations: "External delivery, payment and communication integrations.",
    email_connector: "Reusable email communication provider over Communication Core.",
    sms_connector: "Reusable SMS communication provider over Communication Core.",
    one_connect_dojo: "Dojo EPOS payment connector for terminal-based card processing.",
    one_connect_sumup: "SumUp terminal and cloud payment connector for store and till pairing.",
    one_connect_square: "Square terminal payment connector for card sales, refunds and terminal management.",
    uber_eats: "Uber Eats connection and online order integration.",
    quickbooks: "QuickBooks accounting connection and mapped exports.",
    shopify: "Shopify catalogue, inventory and online-order connection.",
    client_web_shop: "Public storefront, cart, checkout and own-delivery commerce package for client web shops.",
    own_delivery: "Driver assignment, route planning, delivery workspace and order tracking for fulfilled client orders.",
    whatsapp: "WhatsApp Business messaging and customer invoice delivery.",
    whatsapp_connector: "WhatsApp Business communication provider shared by licensed business apps through Communication Core.",
    whatsapp_assistant: "Workflow-driven WhatsApp Business assistant for customer enquiries, customer matching, templates and governed AI or rule-based replies.",
    open_food_facts: "Worldwide barcode and product-name lookup from Open Food Facts.",
    upcitemdb: "Worldwide UPC, EAN and GTIN lookup through UPCitemdb.",
    barcode_nest: "UPC, EAN and GTIN lookup through BarcodeNest using a customer API key.",
    go_upc: "Live product barcode lookup using a customer-provided Go-UPC API key.",
    supplier_core: "Canonical supplier identity and supplier-product sourcing metadata.",
    purchasing_core: "Protected purchasing, receiving and supplier-return metadata foundation.",
    loyalty: "Canonical loyalty configuration, balances, activity and rules.",
    finance_core: "Reusable financial ledger and supplier-accounting foundation.",
    connector_core: "Hidden runtime, capability routing and hardware-service contracts for installable connector apps.",
    communication_core: "Provider-neutral communication events, templates, delivery tracking and workflow actions for Email, SMS and WhatsApp.",
    mobile_scanner_connector: "Send-only phone barcode scanning paired to one store and till.",
    paypal_qr: "Metadata-driven PayPal QR payment connector for transaction-specific checkout and verification.",
    one_connect_google: "Licensed Google Workspace/OpenID Connect single sign-on for onePOS users.",
    smsgate_connector: "SMSGate Android SMS provider for Communication Core.",
    one_assistant: "Workflow-first appointment booking, calendar and communication automation.",
    payment_reference: "Test-only reference payment simulator for connector validation.",
    payment_connector_template: "Hidden payment connector package template.",
    receipt_printer_connector_template: "Hidden receipt-printer connector package template.",
    kitchen_printer_connector_template: "Hidden kitchen-printer connector package template.",
    cash_drawer_connector_template: "Hidden cash-drawer connector package template.",
    mobile_scanner_connector: "Phone barcode scanner connector paired to a store and till.",
    barcode_scanner_connector_template: "Hidden barcode-scanner connector package template.",
  };
  const entitlementKeys = {
    retail_pos: "pos", one_kiosk: "one_kiosk", products: "pos", inventory: "inventory", batch_expiry: "batch_expiry",
    hospitality: "hospitality", kds: "kds", customer_credit: "credit_control", suppliers: "purchasing", customers: "customers", staff: "staff",
    reports: "reports", online_orders: "online_orders", integrations: "integrations",
    email_connector: "communications.email", sms_connector: "communications.sms",
    one_connect_dojo: "one_connect_dojo",
    one_connect_sumup: "one_connect_sumup",
    one_connect_square: "one_connect_square",
    uber_eats: "integrations", platform: "platform", loyalty: "loyalty",
    quickbooks: "integrations", shopify: "integrations", client_web_shop: "client_web_shop", own_delivery: "delivery",
    whatsapp: "integrations", whatsapp_connector: "integrations", whatsapp_assistant: "whatsapp_assistant",
    open_food_facts: "open_food_facts_connector", upcitemdb: "upcitemdb_connector", barcode_nest: "barcode_nest_connector",
    paypal_qr: "paypal_qr",
    one_connect_google: "google_sso",
    smsgate_connector: "communications.sms",
    one_assistant: "one_assistant",
  };
  const dependencies = {
    retail_pos: ["products"],
    one_kiosk: ["products", "online_orders", "retail_pos"],
    inventory: ["products"],
    batch_expiry: ["inventory", "products"],
    client_web_shop: ["products", "inventory", "online_orders", "retail_pos", "customers"],
    own_delivery: ["client_web_shop", "online_orders", "staff"],
    hospitality: ["retail_pos", "customers"],
    kds: ["hospitality", "retail_pos"],
    customer_credit: ["customers", "retail_pos"],
    suppliers: ["supplier_core"],
    supplier_core: ["products"],
    reports: [],
    platform: [],
    uber_eats: ["integrations", "online_orders"],
    whatsapp: ["integrations"],
    whatsapp_connector: ["communication_core"],
    whatsapp_assistant: ["communication_core", "customers", "platform"],
    open_food_facts: ["products"],
    upcitemdb: ["products"],
    barcode_nest: ["products"],
    go_upc: ["products"],
    finance_core: ["suppliers"],
    connector_core: [],
    communication_core: ["platform"],
    email_connector: ["communication_core"],
    sms_connector: ["communication_core"],
    mobile_scanner_connector: ["connector_core"],
    loyalty: ["customers", "retail_pos"],
    paypal_qr: ["connector_core"],
    one_connect_dojo: ["connector_core"],
    one_connect_sumup: ["connector_core"],
    one_connect_square: ["connector_core"],
    one_connect_google: ["connector_core"],
    smsgate_connector: ["connector_core", "communication_core", "sms_connector"],
    one_assistant: ["customers", "platform"],
    payment_reference: ["connector_core"],
    payment_connector_template: ["connector_core"],
    receipt_printer_connector_template: ["connector_core"],
    kitchen_printer_connector_template: ["connector_core"],
    cash_drawer_connector_template: ["connector_core"],
    barcode_scanner_connector_template: ["connector_core"],
  };
  const packageType = entry.packageType === "FOUNDATION" || entry.technical === true
    ? "FOUNDATION"
    : "APPLICATION";
  const billable = packageType === "APPLICATION" && entry.billable !== false;
  const licenceMode = entry.licenceMode || (packageType === "FOUNDATION" ? "TECHNICAL" : "COMMERCIAL");

  // Connector package permissions are derived from the connector contract so
  // a package cannot forget runtime permissions that its actions require.
  // This keeps current and future connector packages aligned automatically.
  const manifestPermissions = new Set(Array.isArray(entry.permissions) ? entry.permissions : []);
  // Foundation package manifests must carry the same RBAC contract as their catalogue surface.
  // Staff explicitly owns user/attendance capabilities and must never silently drop user.create.
  if (entry.key === "staff") for (const permission of ["user.view","user.create","user.edit","attendance.view","attendance.use"]) manifestPermissions.add(permission);
  if (entry.connectorApp && typeof entry.connectorApp === "object") {
    manifestPermissions.add("connector.test");
    manifestPermissions.add("connector.view");
    manifestPermissions.add("connector.manage");
    for (const capability of Array.isArray(entry.connectorApp.capabilities) ? entry.connectorApp.capabilities : []) {
      if (!capability || typeof capability !== "object") continue;
      for (const permission of Array.isArray(capability.requiredPermissions) ? capability.requiredPermissions : []) {
        if (permission) manifestPermissions.add(permission);
      }
    }
  }

  return {
    packageKey: entry.packageKey || entry.key,
    name: packageNames[entry.key] || entry.name,
    version: entry.version || "1.0.0",
    description: packageDescriptions[entry.key] || entry.description,
    dependencies: Array.isArray(entry.dependencies) ? entry.dependencies : (dependencies[entry.key] || []),
    moduleKey: entry.key,
    manifest: {
      packageKey: entry.packageKey || entry.key,
      name: packageNames[entry.key] || entry.name,
      version: entry.version || "1.0.0",
      packageType,
      publisher: entry.publisher || "OneSolutions",
      category: entry.category || "Business",
      description: packageDescriptions[entry.key] || entry.description,
      route: entry.route,
      entitlementKey: entry.entitlementKey || entitlementKeys[entry.key] || entry.key,
      licenceMode,
      licenceRequired: entry.licenceRequired !== false && licenceMode === "COMMERCIAL",
      billable,
      visibility: entry.visibility || (packageType === "FOUNDATION" ? "HIDDEN" : "PUBLIC"),
      installable: entry.installable !== false,
      systemOnly: entry.systemOnly === true || packageType === "FOUNDATION",
      displayOrder: Number.isInteger(entry.displayOrder) ? entry.displayOrder : 0,
      lifecycleState: entry.lifecycleState || "PUBLISHED",
      permissions: [...manifestPermissions],
      storeScoped: entry.storeScoped === true,
      bootstrapFoundation: entry.bootstrapFoundation === true,
      dependencies: Array.isArray(entry.dependencies) ? entry.dependencies : (dependencies[entry.key] || []),
      optionalDependencies: Array.isArray(entry.optionalDependencies) ? entry.optionalDependencies : [],
      versionConstraints: Object.fromEntries(
        (Array.isArray(entry.dependencies) ? entry.dependencies : (dependencies[entry.key] || []))
          .filter((dependency) => dependency && typeof dependency === "object")
          .map((dependency) => [
            dependency.packageKey || dependency.package_key,
            {
              minVersion: dependency.minVersion || dependency.min_version || null,
              maxVersion: dependency.maxVersion || dependency.max_version || null,
              versionRange: dependency.versionRange || dependency.version_range || null,
              optional: dependency.optional === true,
            },
          ])
      ),
      metadataOwnership: {
        policy: "PACKAGE_MANAGED",
        preserveUserModified: true,
        requiredTypes: ["object", "field", "relationship", "form", "layout", "workflow", "action", "report", "permission", "connector", "template"],
      },
      optionalFeatures: Array.isArray(entry.optionalFeatures) ? entry.optionalFeatures : [],
      capabilities: Array.isArray(entry.capabilities) ? entry.capabilities : [entry.key],
      providerConnector: entry.providerConnector || null,
      connectorApp: entry.connectorApp || null,
      connectors: (() => {
        const provider = entry.providerConnector || {};
        const lookup = provider.globalProductLookup || {};
        const definitions = {
          open_food_facts: {
            authType: "none",
            baseUrl: lookup.baseUrl || "https://world.openfoodfacts.org",
            credentialsSchema: [],
            operations: [{ key: "test_connection", name: "Test Connection", method: "GET", path: lookup.testEndpoint || "/api/v2/product/737628064502.json" }],
          },
          go_upc: {
            authType: "bearer",
            baseUrl: lookup.baseUrl || "https://go-upc.com",
            credentialsSchema: [{ key: "token", type: "secret", required: true, label: "API key" }],
            operations: [{ key: "test_connection", name: "Test Connection", method: "GET", path: lookup.testEndpoint || "/api/v1/code/737628064502" }],
          },
          quickbooks: {
            authType: "bearer",
            baseUrl: "https://quickbooks.api.intuit.com",
            credentialsSchema: [{ key: "token", type: "secret", required: true, label: "OAuth access token" }],
            operations: [{ key: "test_connection", name: "Test Connection", method: "GET", path: "/v3/company/{{input.realmId}}/companyinfo/{{input.realmId}}", request: { query: { minorversion: "75" } } }],
          },
          shopify: {
            authType: "api_key",
            baseUrl: "https://example.myshopify.com",
            credentialsSchema: [{ key: "apiKey", type: "secret", required: true, label: "Admin API access token" }, { key: "headerName", type: "string", required: false, label: "Authentication header" }],
            operations: [{ key: "test_connection", name: "Test Connection", method: "GET", path: "/admin/api/2025-01/shop.json" }],
          },
          uber_eats: {
            authType: "oauth2_client_credentials",
            baseUrl: "https://api.uber.com",
            credentialsSchema: [
              { key: "clientId", type: "string", required: true, label: "Client ID" },
              { key: "clientSecret", type: "secret", required: true, label: "Client Secret" },
            ],
            operations: [
              {
                key: "oauth_client_credentials",
                name: "OAuth Client Credentials",
                method: "POST",
                tokenUrls: {
                  sandbox: "https://sandbox-login.uber.com/oauth/v2/token",
                  production: "https://auth.uber.com/oauth/v2/token",
                },
                scope: "eats.store eats.order eats.pos_provisioning",
              },
              { key: "test_connection", name: "Test Connection", method: "GET", path: "/v1/eats/stores" },
            ],
          },
          whatsapp: {
            authType: "bearer",
            baseUrl: "https://graph.facebook.com/v21.0",
            credentialsSchema: [{ key: "token", type: "secret", required: true, label: "Meta access token" }],
            operations: [{ key: "send_message", name: "Send WhatsApp Message", method: "POST", path: "/{{phoneNumberId}}/messages" }],
          },
        };
        const definition = definitions[entry.key];
        if (!definition) return [];
        return [{
          connectorKey: entry.packageKey || entry.key,
          name: `${entry.name} Connection`,
          description: `Metadata-driven connection for ${entry.name}.`,
          publisher: entry.publisher || "OneSolutions",
          ...definition,
          timeoutMs: Number(lookup.timeoutMs) || 15000,
          retryPolicy: { maxAttempts: 1, backoffMs: 0 },
          required: true,
        }];
      })(),
      ...(entry.key === "uber_eats" ? { workflows: uberEatsWorkflowDefinitions() } : {}),
      iconAssetKey: entry.iconAssetKey || iconAssetKeys[entry.key] || null,
      ...(entry.key === "one_kiosk" ? {
        workflows: [
          {
            objectKey: "product",
            name: "OneKiosk - Case 1 Restaurant",
            triggerKey: "kiosk_experience",
            conditions: [],
            action: {
              type: "workflow",
              scope: "one_kiosk",
              flowType: "KIOSK_EXPERIENCE",
              templateKey: "one_kiosk_case_1_restaurant",
              defaultForNewDevices: true,
              ui: {
                schemaVersion: 1,
                profile: "RESTAURANT",
                startScreen: "catalogue",
                theme: { density: "touch", productCard: "image", accentRole: "primary" },
                languages: [{ key: "en", label: "English" }, { key: "es", label: "Español" }, { key: "fr", label: "Français" }],
                translations: {
                  es: {
                    "screen.catalogue.title": "¿Qué te gustaría?",
                    "screen.upsell.title": "Hazlo a tu gusto",
                    "screen.fulfilment.title": "¿Cómo lo quieres?",
                    "fulfilment.EAT_IN": "Comer aquí",
                    "fulfilment.TAKEAWAY": "Para llevar",
                    "fulfilment.COLLECT": "Recoger",
                    "screen.loyalty.title": "Recompensas",
                    "screen.payment.title": "Pago",
                    "screen.confirmation.title": "Gracias",
                    "confirmation.collectionLabel": "Tu número de recogida",
                    "confirmation.doneLabel": "Nuevo pedido"
                  },
                  fr: {
                    "screen.catalogue.title": "Que souhaitez-vous ?",
                    "screen.upsell.title": "Personnalisez votre commande",
                    "screen.fulfilment.title": "Comment souhaitez-vous votre commande ?",
                    "fulfilment.EAT_IN": "Sur place",
                    "fulfilment.TAKEAWAY": "À emporter",
                    "fulfilment.COLLECT": "Retrait",
                    "screen.loyalty.title": "Récompenses",
                    "screen.payment.title": "Paiement",
                    "screen.confirmation.title": "Merci",
                    "confirmation.collectionLabel": "Votre numéro de retrait",
                    "confirmation.doneLabel": "Nouvelle commande"
                  }
                },
                orderDisplay: {
                  title: "Order collection",
                  activeLabel: "Preparing",
                  readyLabel: "Ready to collect",
                  activeStatuses: ["PREPARING","ACCEPTED"],
                  readyStatuses: ["READY","READY_FOR_PICKUP"],
                  activeEmpty: "No orders preparing",
                  readyEmpty: "No orders ready"
                },
                screens: [
                  { key: "catalogue", type: "CATALOGUE", title: "What would you like?", search: true, categories: true, productAction: "OPEN_DETAIL", next: "product" },
                  { key: "product", type: "PRODUCT_DETAIL", imageGallery: true, description: true, modifiers: true, nutrition: true, allergens: true, next: "upsell" },
                  { key: "upsell", type: "RECOMMENDATIONS", source: "CROSS_SELL", title: "Make it yours", optional: true, next: "fulfilment" },
                  { key: "fulfilment", type: "FULFILMENT", title: "How would you like it?", defaultOption: "EAT_IN", next: "service_details", options: [
                    { key: "EAT_IN", label: "Eat in", canonicalType: "SELF_PICKUP" },
                    { key: "TAKEAWAY", label: "Takeaway", canonicalType: "SELF_PICKUP" },
                    { key: "COLLECT", label: "Collect", canonicalType: "SELF_PICKUP" }
                  ] },
                  { key: "service_details", type: "FORM", title: "Order details", optional: true, next: "basket", showWhen: { path: "fulfilmentType", operator: "equals", value: "EAT_IN" }, fields: [
                    { key: "tableNumber", label: "Table number", type: "text", required: false, placeholder: "Optional table number" }
                  ] },
                  { key: "basket", type: "BASKET", editable: true, promotions: true, next: "loyalty" },
                  { key: "loyalty", type: "LOYALTY", title: "Rewards", subtitle: "Scan or enter your details to collect rewards, or continue as a guest.", optional: true, next: "payment" },
                  { key: "payment", type: "PAYMENT", methods: ["CARD"], actionLabel: "Pay & collect", next: "confirmation" },
                  { key: "confirmation", type: "CONFIRMATION", title: "Thank you", subtitle: "Your order has been sent for preparation.", collectionNumber: true, collectionLabel: "Your collection number", helpText: "Keep this number and go to the collection counter. Your number will be shown when your order is ready.", doneLabel: "Start a new order", receipt: ["PRINT","QR"], resetAfterSeconds: 30 }
                ],
                features: {
                  variants: false, modifiers: true, promotions: true, upsell: true, loyalty: true,
                  stockPromise: false, compare: false, specifications: false, warranty: false,
                  accessibility: true, language: true, audio: true, ageVerification: true, assistance: true, idleReset: true
                }
              },
              actions: []
            },
            active: true,
            lifecycleStatus: "ACTIVE"
          },
          {
            objectKey: "product",
            name: "OneKiosk - Case 2 Retail / Electronics",
            triggerKey: "kiosk_experience",
            conditions: [],
            action: {
              type: "workflow",
              scope: "one_kiosk",
              flowType: "KIOSK_EXPERIENCE",
              templateKey: "one_kiosk_case_2_retail",
              defaultForNewDevices: false,
              ui: {
                schemaVersion: 1,
                profile: "RETAIL",
                startScreen: "catalogue",
                theme: { density: "touch", productCard: "image_specs", accentRole: "primary" },
                languages: [{ key: "en", label: "English" }, { key: "es", label: "Español" }, { key: "fr", label: "Français" }],
                translations: {
                  es: {
                    "screen.catalogue.title": "Encuentra tu producto",
                    "screen.extras.title": "Accesorios y protección",
                    "screen.fulfilment.title": "Elige la entrega",
                    "fulfilment.COLLECT": "Recoger aquí",
                    "fulfilment.OTHER_STORE": "Recoger en otra tienda",
                    "fulfilment.DELIVERY": "Entrega a domicilio",
                    "screen.loyalty.title": "Tus datos",
                    "screen.payment.title": "Pago",
                    "screen.confirmation.title": "Pedido confirmado",
                    "confirmation.collectionLabel": "Número de pedido / recogida",
                    "confirmation.doneLabel": "Hacer otro pedido"
                  },
                  fr: {
                    "screen.catalogue.title": "Trouvez votre produit",
                    "screen.extras.title": "Accessoires et protection",
                    "screen.fulfilment.title": "Choisissez la livraison",
                    "fulfilment.COLLECT": "Retrait ici",
                    "fulfilment.OTHER_STORE": "Retrait dans un autre magasin",
                    "fulfilment.DELIVERY": "Livraison à domicile",
                    "screen.loyalty.title": "Vos coordonnées",
                    "screen.payment.title": "Paiement",
                    "screen.confirmation.title": "Commande confirmée",
                    "confirmation.collectionLabel": "Numéro de commande / retrait",
                    "confirmation.doneLabel": "Nouvelle commande"
                  }
                },
                orderDisplay: {
                  title: "Collection status",
                  activeLabel: "Processing",
                  readyLabel: "Ready for collection",
                  activeStatuses: ["PREPARING","ACCEPTED"],
                  readyStatuses: ["READY","READY_FOR_PICKUP"],
                  activeEmpty: "No orders being processed",
                  readyEmpty: "No orders ready for collection"
                },
                screens: [
                  { key: "catalogue", type: "CATALOGUE", title: "Find your product", search: true, categories: true, productAction: "OPEN_DETAIL", next: "product" },
                  { key: "product", type: "PRODUCT_DETAIL", imageGallery: true, description: true, variants: true, specifications: true, stockPromise: true, compare: true, warranty: true, next: "extras" },
                  { key: "extras", type: "RECOMMENDATIONS", source: "ACCESSORY", title: "Accessories & protection", warranty: true, optional: true, next: "fulfilment" },
                  { key: "fulfilment", type: "FULFILMENT", title: "Choose fulfilment", defaultOption: "COLLECT", next: "service_details", options: [
                    { key: "COLLECT", label: "Collect here", canonicalType: "SELF_PICKUP", requires: [] },
                    { key: "OTHER_STORE", label: "Collect another store", canonicalType: "SELF_PICKUP", requires: ["STORE"] },
                    { key: "DELIVERY", label: "Home delivery", canonicalType: "DELIVERY", requires: ["ADDRESS","CONTACT"] }
                  ], stockPromise: true },
                  { key: "service_details", type: "FORM", title: "Extra order details", optional: true, next: "basket", fields: [
                    { key: "preferredSlot", label: "Preferred collection / delivery slot", type: "select", required: false, options: ["As soon as possible","Morning","Afternoon","Evening"] },
                    { key: "installationRequired", label: "Installation service", type: "select", required: false, options: ["No installation","Installation required"] },
                    { key: "notes", label: "Order notes", type: "textarea", required: false, placeholder: "Optional instructions" }
                  ] },
                  { key: "basket", type: "BASKET", editable: true, promotions: true, next: "loyalty" },
                  { key: "loyalty", type: "LOYALTY", title: "Your details", subtitle: "Enter your phone number or email for rewards and order updates, or continue as a guest.", optional: true, next: "payment" },
                  { key: "payment", type: "PAYMENT", methods: ["CARD"], actionLabel: "Pay & order", next: "confirmation" },
                  { key: "confirmation", type: "CONFIRMATION", title: "Order confirmed", subtitle: "Your order has been placed.", collectionNumber: true, collectionLabel: "Order / collection number", helpText: "Keep this reference. We will show when your order is ready for collection.", doneLabel: "Start another order", receipt: ["PRINT","QR","EMAIL"], collectionVerification: true, resetAfterSeconds: 30 }
                ],
                features: {
                  variants: true, modifiers: false, promotions: true, upsell: true, loyalty: true,
                  stockPromise: true, compare: true, specifications: true, warranty: true,
                  accessibility: true, language: true, audio: true, ageVerification: true, assistance: true, idleReset: true
                }
              },
              actions: []
            },
            active: true,
            lifecycleStatus: "ACTIVE"
          }
        ]
      } : {}),
      ...(entry.key === "communication_core" ? {
        packageKey: "communication_core",
        packageType: "FOUNDATION",
        name: "Communication Core",
        version: entry.version || "1.0.0",
        description: "Provider-neutral communication events, templates, delivery tracking and workflow actions for Email, SMS and WhatsApp.",
        dependencies: ["platform"],
        billable: false,
        licenceRequired: false,
        visibility: "HIDDEN",
        installable: true,
        systemOnly: true,
        technical: true,
        capabilities: [
          "communication_provider_metadata",
          "communication_templates",
          "communication_send",
          "communication_receive",
          "communication_delivery_events",
          "communication_workflow_triggers"
        ],
        communication: {
          channels: ["EMAIL", "SMS", "WHATSAPP"],
          providerMetadataSource: "integrations",
          templateSource: "platform_message_templates",
          deliverySource: "platform_communication_deliveries",
          events: [
            "communication.message_received",
            "communication.message_sent",
            "communication.message_delivered",
            "communication.message_failed",
            "communication.opted_out",
            "communication.handoff"
          ],
          action: "SEND_COMMUNICATION",
          channels: ["EMAIL","SMS","WHATSAPP","IN_APP"],
          legacyActions: {
            EMAIL: "SEND_EMAIL",
            SMS: "SEND_SMS",
            WHATSAPP: "SEND_WHATSAPP",
            IN_APP: "IN_APP_NOTIFICATION"
          }
        },
        objects: [
          {
            objectKey: "communication_event",
            metadataScope: "global",
            label: "Communication Event",
            pluralLabel: "Communication Events",
            description: "Provider-neutral communication events emitted by Email, SMS and WhatsApp.",
            sourceTable: "platform_communication_events",
            fields: [
              { apiName: "channel", label: "Channel", fieldType: "picklist", sourceColumn: "channel", writable: false, options: ["EMAIL","SMS","WHATSAPP","IN_APP"] },
              { apiName: "event_type", label: "Event Type", fieldType: "text", sourceColumn: "event_type", writable: false },
              { apiName: "direction", label: "Direction", fieldType: "text", sourceColumn: "direction", writable: false },
              { apiName: "provider", label: "Provider", fieldType: "text", sourceColumn: "provider", writable: false },
              { apiName: "provider_message_id", label: "Provider Message ID", fieldType: "text", sourceColumn: "provider_message_id", writable: false },
              { apiName: "body", label: "Message", fieldType: "text", sourceColumn: "body", writable: false, displayOrder: 45 },
              { apiName: "recipient", label: "Recipient", fieldType: "text", sourceColumn: "recipient", writable: false },
              { apiName: "sender", label: "Sender", fieldType: "text", sourceColumn: "sender", writable: false },
              { apiName: "record_id", label: "Related Record", fieldType: "text", sourceColumn: "record_id", writable: false },
              { apiName: "metadata", label: "Metadata", fieldType: "json", sourceColumn: "metadata", writable: false },
              { apiName: "created_at", label: "Created", fieldType: "datetime", sourceColumn: "created_at", writable: false }
            ],
          },
        ],
        listViews: [
          { objectKey: "communication_event", viewKey: "recent_communication_events", label: "Recent Communication Events", columns: ["channel","event_type","direction","provider","body","recipient","created_at"], sort: { field: "created_at", direction: "desc" }, pageSize: 50, isDefault: true }
        ],
      } : {}),
      ...(entry.key === "one_assistant" ? oneAssistantManifest : {}),
      ...(entry.key === "whatsapp_assistant" ? {
        workflows: [
          {
            objectKey: "communication_event",
            name: "WhatsApp Assistant - inbound message",
            triggerKey: "communication_message_received",
            conditions: [{ field: "channel", operator: "equals", value: "WHATSAPP" }],
            action: {
              type: "workflow",
              scope: "whatsapp_assistant",
              channel: "WHATSAPP",
              actions: []
            },
            active: false,
          },
          {
            objectKey: "communication_event",
            name: "WhatsApp Assistant - human handoff",
            triggerKey: "communication_handoff",
            conditions: [{ field: "channel", operator: "equals", value: "WHATSAPP" }],
            action: {
              type: "workflow",
              scope: "whatsapp_assistant",
              channel: "WHATSAPP",
              actions: []
            },
            active: false,
          }
        ],
      } : {}),
      ...(entry.key === "retail_pos" ? {
        objects: [
          { objectKey:"till_session",metadataScope:"global",label:"Till Session",pluralLabel:"Till Sessions",sourceTable:"till_sessions",storeScoped:true,config:{flowWritesOnly:true},fields:[{apiName:"terminal_id",label:"Terminal",fieldType:"lookup",sourceColumn:"terminal_id",writable:true},{apiName:"store_id",label:"Store",fieldType:"lookup",sourceColumn:"store_id",writable:true},{apiName:"user_id",label:"User",fieldType:"lookup",sourceColumn:"user_id",writable:true},{apiName:"opening_cash",label:"Opening Cash",fieldType:"currency",sourceColumn:"opening_cash",writable:true},{apiName:"closing_cash",label:"Closing Cash",fieldType:"currency",sourceColumn:"closing_cash",writable:true},{apiName:"expected_cash",label:"Expected Cash",fieldType:"currency",sourceColumn:"expected_cash",writable:true},{apiName:"cash_difference",label:"Cash Difference",fieldType:"currency",sourceColumn:"cash_difference",writable:true},{apiName:"status",label:"Status",fieldType:"picklist",sourceColumn:"status",writable:true,options:["open","closed"]},{apiName:"opened_at",label:"Opened",fieldType:"datetime",sourceColumn:"opened_at",writable:false},{apiName:"closed_at",label:"Closed",fieldType:"datetime",sourceColumn:"closed_at",writable:true},{apiName:"closed_by",label:"Closed By",fieldType:"lookup",sourceColumn:"closed_by",writable:true}] },
          { objectKey:"cash_movement",metadataScope:"global",label:"Cash Movement",pluralLabel:"Cash Movements",sourceTable:"cash_movements",storeScoped:true,config:{flowWritesOnly:true},fields:[{apiName:"till_session_id",label:"Till Session",fieldType:"lookup",sourceColumn:"till_session_id",writable:true},{apiName:"user_id",label:"User",fieldType:"lookup",sourceColumn:"user_id",writable:true},{apiName:"store_id",label:"Store",fieldType:"lookup",sourceColumn:"store_id",writable:true},{apiName:"terminal_id",label:"Terminal",fieldType:"lookup",sourceColumn:"terminal_id",writable:true},{apiName:"type",label:"Type",fieldType:"picklist",sourceColumn:"type",writable:true,options:["cash_in","cash_out","drawer_open"]},{apiName:"amount",label:"Amount",fieldType:"currency",sourceColumn:"amount",writable:true},{apiName:"reason",label:"Reason",fieldType:"text",sourceColumn:"reason",writable:true},{apiName:"created_at",label:"Created",fieldType:"datetime",sourceColumn:"created_at",writable:false}] },
          { objectKey:"refund",metadataScope:"global",label:"Refund",pluralLabel:"Refunds",sourceTable:"refunds",required:true,config:{flowWritesOnly:true},fields:[{apiName:"sale_id",label:"Sale",fieldType:"lookup",sourceColumn:"sale_id",writable:true,required:true,config:{relatedObjectKey:"sale"}},{apiName:"user_id",label:"User",fieldType:"lookup",sourceColumn:"user_id",writable:true,required:true},{apiName:"amount",label:"Amount",fieldType:"currency",sourceColumn:"amount",writable:true,required:true},{apiName:"reason",label:"Reason",fieldType:"text",sourceColumn:"reason",writable:true},{apiName:"payment_method",label:"Payment Method",fieldType:"text",sourceColumn:"payment_method",writable:true},{apiName:"return_id",label:"Return",fieldType:"lookup",sourceColumn:"return_id",writable:true},{apiName:"created_at",label:"Created",fieldType:"datetime",sourceColumn:"created_at",writable:false}] },

          {
            objectKey: "sale", metadataScope: "global", label: "Sale", pluralLabel: "Sales",
            description: "Canonical sales transaction header.", sourceTable: "sales", storeScoped: true,
            fields: [
              { apiName:"company_id",label:"Company",fieldType:"lookup",sourceColumn:"company_id",writable:false },
              { apiName:"store_id",label:"Store",fieldType:"lookup",sourceColumn:"store_id",writable:true },
              { apiName:"terminal_id",label:"Terminal",fieldType:"lookup",sourceColumn:"terminal_id",writable:true },
              { apiName:"user_id",label:"User",fieldType:"lookup",sourceColumn:"user_id",writable:true },
              { apiName:"customer_id",label:"Customer",fieldType:"lookup",sourceColumn:"customer_id",writable:true },
              { apiName:"receipt_number",label:"Receipt Number",fieldType:"text",sourceColumn:"receipt_number",writable:true },
              { apiName:"subtotal",label:"Subtotal",fieldType:"currency",sourceColumn:"subtotal",writable:true },
              { apiName:"tax",label:"Tax",fieldType:"currency",sourceColumn:"tax",writable:true },
              { apiName:"discount",label:"Discount",fieldType:"currency",sourceColumn:"discount",writable:true },
              { apiName:"total",label:"Total",fieldType:"currency",sourceColumn:"total",writable:true },
              { apiName:"line_count",label:"Line Count",fieldType:"number",sourceColumn:"line_count",writable:true },
              { apiName:"status",label:"Status",fieldType:"picklist",sourceColumn:"status",writable:true },
              { apiName:"offline_created",label:"Offline Created",fieldType:"boolean",sourceColumn:"offline_created",writable:true },
              { apiName:"sync_status",label:"Sync Status",fieldType:"text",sourceColumn:"sync_status",writable:true },
              { apiName:"client_request_id",label:"Client Request ID",fieldType:"text",sourceColumn:"client_request_id",writable:true },
              { apiName:"client_request_fingerprint",label:"Client Request Fingerprint",fieldType:"text",sourceColumn:"client_request_fingerprint",writable:true },
              { apiName:"created_at",label:"Created",fieldType:"datetime",sourceColumn:"created_at",writable:false },
              { apiName:"completed_at",label:"Completed",fieldType:"datetime",sourceColumn:"completed_at",writable:true }
            ],
          },
          {
            objectKey: "sale_item", metadataScope: "global", label: "Sale Item", pluralLabel: "Sale Items",
            description: "Canonical line item related to a Sale.", sourceTable: "sale_items",
            fields: [
              { apiName:"sale_id",label:"Sale",fieldType:"lookup",sourceColumn:"sale_id",required:true,writable:true,config:{relatedObjectKey:"sale"} },
              { apiName:"product_id",label:"Product",fieldType:"lookup",sourceColumn:"product_id",required:true,writable:true,config:{relatedObjectKey:"product"} },
              { apiName:"product_name",label:"Product Name",fieldType:"text",sourceColumn:"product_name",required:true,writable:true },
              { apiName:"quantity",label:"Quantity",fieldType:"decimal",sourceColumn:"quantity",required:true,writable:true },
              { apiName:"unit_price",label:"Unit Price",fieldType:"currency",sourceColumn:"unit_price",required:true,writable:true },
              { apiName:"discount",label:"Discount",fieldType:"currency",sourceColumn:"discount",writable:true },
              { apiName:"tax",label:"Tax",fieldType:"currency",sourceColumn:"tax",writable:true },
              { apiName:"total",label:"Total",fieldType:"currency",sourceColumn:"total",required:true,writable:true },
              { apiName:"item_type",label:"Item Type",fieldType:"text",sourceColumn:"item_type",writable:true },
              { apiName:"modifier_data",label:"Modifiers",fieldType:"json",sourceColumn:"modifier_data",writable:true },
              { apiName:"bundle_components",label:"Bundle Components",fieldType:"json",sourceColumn:"bundle_components",writable:true }
            ],
          },
          {
            objectKey: "payment", metadataScope: "global", label: "Payment", pluralLabel: "Payments",
            description: "Canonical payment record related to a transaction.", sourceTable: "payments", storeScoped: true,
            fields: [
              { apiName:"sale_id",label:"Sale",fieldType:"lookup",sourceColumn:"sale_id",writable:true,config:{relatedObjectKey:"sale"} },
              { apiName:"company_id",label:"Company",fieldType:"lookup",sourceColumn:"company_id",writable:false },
              { apiName:"store_id",label:"Store",fieldType:"lookup",sourceColumn:"store_id",writable:true },
              { apiName:"customer_id",label:"Customer",fieldType:"lookup",sourceColumn:"customer_id",writable:true },
              { apiName:"transaction_id",label:"Transaction",fieldType:"lookup",sourceColumn:"transaction_id",writable:true,config:{relatedObjectKey:"sale"} },
              { apiName:"direction",label:"Direction",fieldType:"picklist",sourceColumn:"direction",writable:true },
              { apiName:"reference",label:"Reference",fieldType:"text",sourceColumn:"reference",writable:true },
              { apiName:"payment_method",label:"Payment Method",fieldType:"text",sourceColumn:"payment_method",required:true,writable:true },
              { apiName:"amount",label:"Amount",fieldType:"currency",sourceColumn:"amount",required:true,writable:true },
              { apiName:"provider",label:"Provider",fieldType:"text",sourceColumn:"provider",writable:true },
              { apiName:"terminal_id",label:"Terminal",fieldType:"text",sourceColumn:"terminal_id",writable:true },
              { apiName:"provider_transaction_id",label:"Provider Transaction ID",fieldType:"text",sourceColumn:"provider_transaction_id",writable:true },
              { apiName:"idempotency_key",label:"Idempotency Key",fieldType:"text",sourceColumn:"idempotency_key",writable:true },
              { apiName:"status",label:"Status",fieldType:"picklist",sourceColumn:"status",writable:true },
              { apiName:"created_at",label:"Created",fieldType:"datetime",sourceColumn:"created_at",writable:false }
            ],
          },
        ],
        relationships: [
          { parentObjectKey:"till_session",childObjectKey:"cash_movement",relationshipKey:"cash_movements",relationshipType:"one_to_many",childFieldApiName:"till_session_id" },
          { parentObjectKey:"sale",childObjectKey:"sale_item",relationshipKey:"items",relationshipType:"one_to_many",childFieldApiName:"sale_id" },
          { parentObjectKey:"sale_item",childObjectKey:"sale",relationshipKey:"sale",relationshipType:"lookup",childFieldApiName:"sale_id" },
          { parentObjectKey:"sale",childObjectKey:"payment",relationshipKey:"payments",relationshipType:"one_to_many",childFieldApiName:"sale_id" },
          { parentObjectKey:"sale",childObjectKey:"refund",relationshipKey:"refunds",relationshipType:"one_to_many",childFieldApiName:"sale_id" },
          { parentObjectKey:"payment",childObjectKey:"sale",relationshipKey:"sale",relationshipType:"lookup",childFieldApiName:"sale_id" },
        ],
        rules: [
          { objectKey:"till_session",name:"Opening cash cannot be negative",triggerKey:"before_save",conditions:[{field:"opening_cash",operator:"less_than",value:0}],action:{type:"validation",message:"Opening cash cannot be negative"} },
          { objectKey:"cash_movement",name:"Cash movement amount cannot be negative",triggerKey:"before_save",conditions:[{field:"amount",operator:"less_than",value:0}],action:{type:"validation",message:"Cash movement amount cannot be negative"} },
          { objectKey:"refund",name:"Refund amount must be positive",triggerKey:"before_save",conditions:[{field:"amount",operator:"less_than_or_equal",value:0}],action:{type:"validation",message:"Refund amount must be positive"} },
          { objectKey:"stock_return",name:"Customer return must reference a sale",triggerKey:"before_save",conditions:[{field:"return_type",operator:"equals",value:"CUSTOMER"},{field:"sale_id",operator:"is_blank"}],action:{type:"validation",message:"Customer returns must reference the original sale"} },
          { objectKey:"sale",name:"Sale total cannot be negative",triggerKey:"before_save",conditions:[{field:"total",operator:"less_than",value:0}],action:{type:"validation",message:"Sale total cannot be negative"} },
          { objectKey:"sale",name:"Sale must contain at least one line",triggerKey:"before_save",conditions:[{field:"line_count",operator:"less_than_or_equal",value:0}],action:{type:"validation",message:"A sale must contain at least one line"} },
          { objectKey:"sale_item",name:"Sale item quantity must be positive",triggerKey:"before_save",conditions:[{field:"quantity",operator:"less_than_or_equal",value:0}],action:{type:"validation",message:"Sale item quantity must be greater than zero"} },
          { objectKey:"payment",name:"Payment amount must be positive",triggerKey:"before_save",conditions:[{field:"amount",operator:"less_than_or_equal",value:0}],action:{type:"validation",message:"Payment amount must be greater than zero"} },
        ],
        buttons: [
          { objectKey:"sale",buttonKey:"till_complete_sale",label:"Complete Sale",targetType:"workflow",targetKey:"Complete Sale",placement:"till_checkout",requiredPermission:"workflow.execute",inputMappings:{} }
        ],
        workflows: [
          {
            objectKey:"till_session",name:"Open Till Session",triggerKey:"manual",active:true,lifecycleStatus:"ACTIVE",
            action:{type:"workflow",scope:"retail_pos",flowType:"AUTOLAUNCHED",apiName:"OPEN_TILL_SESSION",capabilityType:"workflow",capabilityKey:"till.open",systemGenerated:true,systemKey:"flow:till.open",inputContract:[{name:"session",type:"record",required:true}],outputContract:[{name:"session",type:"record",source:"variables.session"}],resources:[{value:"variables.session",apiName:"session",label:"Till Session",type:"Variable",dataType:"Record",defaultValue:null,isCollection:false,availableInput:true,availableOutput:true,objectKey:"till_session"}],actions:[{id:"create_session",label:"Create Till Session",apiName:"create_session",key:"CREATE_RECORD",objectKey:"till_session",recordResource:{path:"variables.session"}}]}
          },
          {
            objectKey:"till_session",name:"Close Till Session",triggerKey:"manual",active:true,lifecycleStatus:"ACTIVE",
            action:{type:"workflow",scope:"retail_pos",flowType:"AUTOLAUNCHED",apiName:"CLOSE_TILL_SESSION",capabilityType:"workflow",capabilityKey:"till.close",systemGenerated:true,systemKey:"flow:till.close",inputContract:[{name:"session",type:"record",required:true}],outputContract:[{name:"session",type:"record",source:"variables.session"}],resources:[{value:"variables.session",apiName:"session",label:"Till Session",type:"Variable",dataType:"Record",defaultValue:null,isCollection:false,availableInput:true,availableOutput:true,objectKey:"till_session"}],actions:[{id:"update_session",label:"Close Till Session",apiName:"update_session",key:"UPDATE_RECORD",objectKey:"till_session",recordResource:{path:"variables.session"}}]}
          },
          {
            objectKey:"cash_movement",name:"Record Cash Movement",triggerKey:"manual",active:true,lifecycleStatus:"ACTIVE",
            action:{type:"workflow",scope:"retail_pos",flowType:"AUTOLAUNCHED",apiName:"RECORD_CASH_MOVEMENT",capabilityType:"workflow",capabilityKey:"till.cash.move",systemGenerated:true,systemKey:"flow:till.cash.move",inputContract:[{name:"movement",type:"record",required:true}],outputContract:[{name:"movement",type:"record",source:"variables.movement"}],resources:[{value:"variables.movement",apiName:"movement",label:"Cash Movement",type:"Variable",dataType:"Record",defaultValue:null,isCollection:false,availableInput:true,availableOutput:true,objectKey:"cash_movement"}],actions:[{id:"create_movement",label:"Create Cash Movement",apiName:"create_movement",key:"CREATE_RECORD",objectKey:"cash_movement",recordResource:{path:"variables.movement"}}]}
          },
          {
            objectKey:"stock_return",name:"Create Customer Return",triggerKey:"manual",active:true,lifecycleStatus:"ACTIVE",
            action:{type:"workflow",scope:"retail_pos",flowType:"AUTOLAUNCHED",apiName:"CREATE_CUSTOMER_RETURN",capabilityType:"workflow",capabilityKey:"return.create",systemGenerated:true,systemKey:"flow:return.create",inputContract:[{name:"return",type:"record",required:true},{name:"items",type:"collection",required:true}],outputContract:[{name:"return",type:"record",source:"variables.return"}],resources:[{value:"variables.return",apiName:"return",label:"Return",type:"Variable",dataType:"Record",defaultValue:null,isCollection:false,availableInput:true,availableOutput:true,objectKey:"stock_return"},{value:"variables.items",apiName:"items",label:"Return Items",type:"Variable",dataType:"Collection",defaultValue:[],isCollection:true,availableInput:true,availableOutput:false,objectKey:"stock_return_line"}],actions:[{id:"create_return",label:"Create Return",apiName:"create_return",key:"CREATE_RECORD",objectKey:"stock_return",recordResource:{path:"variables.return"}},{id:"create_return_items",label:"Create Return Items",apiName:"create_return_items",key:"CREATE_RECORD",objectKey:"stock_return_line",recordCollectionResource:{path:"variables.items"},commonFieldValues:{return_id:{path:"variables.return.id"}}}]}
          },
          {
            objectKey:"refund",name:"Create Refund",triggerKey:"manual",active:true,lifecycleStatus:"ACTIVE",
            action:{type:"workflow",scope:"retail_pos",flowType:"AUTOLAUNCHED",apiName:"CREATE_REFUND",capabilityType:"workflow",capabilityKey:"refund.create",systemGenerated:true,systemKey:"flow:refund.create",inputContract:[{name:"refund",type:"record",required:true}],outputContract:[{name:"refund",type:"record",source:"variables.refund"}],resources:[{value:"variables.refund",apiName:"refund",label:"Refund",type:"Variable",dataType:"Record",defaultValue:null,isCollection:false,availableInput:true,availableOutput:true,objectKey:"refund"}],actions:[{id:"create_refund",label:"Create Refund",apiName:"create_refund",key:"CREATE_RECORD",objectKey:"refund",recordResource:{path:"variables.refund"}}]}
          },
          {
            objectKey:"sale",name:"Complete Sale",triggerKey:"manual",active:true,lifecycleStatus:"ACTIVE",
            action:{
              type:"workflow",scope:"retail_pos",flowType:"AUTOLAUNCHED",apiName:"COMPLETE_SALE",capabilityType:"workflow",capabilityKey:"sale.complete",systemGenerated:true,systemKey:"flow:sale.complete",
              inputContract:[
                {name:"sale",type:"record",required:true},
                {name:"items",type:"collection",required:true},
                {name:"payments",type:"collection",required:true}
              ],
              outputContract:[{name:"sale",type:"record",source:"variables.sale"}],
              resources:[
                {value:"variables.sale",apiName:"sale",label:"Sale",type:"Variable",dataType:"Record",defaultValue:null,isCollection:false,availableInput:true,availableOutput:true,objectKey:"sale"},
                {value:"variables.items",apiName:"items",label:"Sale Items",type:"Variable",dataType:"Collection",defaultValue:[],isCollection:true,availableInput:true,availableOutput:false,objectKey:"sale_item"},
                {value:"variables.payments",apiName:"payments",label:"Payments",type:"Variable",dataType:"Collection",defaultValue:[],isCollection:true,availableInput:true,availableOutput:false,objectKey:"payment"}
              ],
              actions:[
                {id:"create_sale",label:"1. Create Sale",apiName:"create_sale",key:"CREATE_RECORD",objectKey:"sale",recordResource:{path:"variables.sale"},store:"record"},
                {id:"create_items",label:"3. Create Sale Items",apiName:"create_items",key:"CREATE_RECORD",objectKey:"sale_item",recordCollectionResource:{path:"variables.items"},commonFieldValues:{sale_id:{path:"variables.sale.id"}}},
                {id:"create_payments",label:"4. Create Payments",apiName:"create_payments",key:"CREATE_RECORD",objectKey:"payment",recordCollectionResource:{path:"variables.payments"},commonFieldValues:{sale_id:{path:"variables.sale.id"}}}
              ]
            }
          }
        ],
      } : {}),
      ...(entry.key === "products" ? {
        packageKey: "products",
        packageType: "FOUNDATION",
        name: "Product Core",
        version: entry.version || "1.0.0",
        description: "Technical foundation for the canonical Product and Category objects.",
        dependencies: [],
        billable: false,
        licenceRequired: false,
        visibility: "HIDDEN",
        installable: true,
        systemOnly: true,
        technical: true,
        upgrade: {
          strategy: "idempotent_metadata_upsert",
          adoptsExistingData: true,
          preservesRecordIds: true,
          migrations: ["product_core.adopt_canonical_metadata.v1"],
        },
        ownedObjects: ["product", "category"],
        ownedFields: {
          product: [
            "name", "sku", "barcode", "description", "category_id", "active",
            "product_kind", "parent_product_id", "variant_attributes", "image_url",
          ],
          category: ["name", "display_order", "active"],
        },
        objects: [
          {
            objectKey: "product",
            adoptFromPackageKeys: ["retail_pos"],
            metadataScope: "global",
            label: "Product",
            pluralLabel: "Products",
            description: "Canonical tenant-scoped product records.",
            sourceTable: "products",
            fields: [
              { apiName: "name", label: "Name", fieldType: "text", sourceColumn: "name", required: true, writable: true, displayOrder: 1 },
              { apiName: "sku", label: "SKU", fieldType: "text", sourceColumn: "sku", writable: true, displayOrder: 2 },
              { apiName: "barcode", label: "Barcode / EAN", fieldType: "text", sourceColumn: "barcode", writable: true, displayOrder: 3 },
              { apiName: "description", label: "Description", fieldType: "text", sourceColumn: "description", writable: true, displayOrder: 4 },
              { apiName: "price", label: "Price", fieldType: "currency", sourceColumn: "price", writable: true, displayOrder: 4 },
              { apiName: "cost_price", label: "Cost Price", fieldType: "currency", sourceColumn: "cost_price", writable: true, displayOrder: 4 },
              { apiName: "vat_rate", label: "VAT Rate", fieldType: "decimal", sourceColumn: "vat_rate", writable: true, displayOrder: 4 },
              { apiName: "vat_applicable", label: "VAT Applicable", fieldType: "boolean", sourceColumn: "vat_applicable", writable: true, displayOrder: 4 },
              { apiName: "age_restricted", label: "Age Restricted", fieldType: "boolean", sourceColumn: "age_restricted", writable: true, displayOrder: 4 },
              { apiName: "stock_quantity", label: "Stock Quantity", fieldType: "decimal", sourceColumn: "stock_quantity", writable: false, displayOrder: 4 },
              { apiName: "low_stock_level", label: "Low Stock Level", fieldType: "decimal", sourceColumn: "low_stock_level", writable: true, displayOrder: 4 },
              { apiName: "track_stock", label: "Track Stock", fieldType: "boolean", sourceColumn: "track_stock", writable: true, displayOrder: 4 },
              { apiName: "batch_tracking", label: "Batch Tracking", fieldType: "boolean", sourceColumn: "batch_tracking", writable: true, displayOrder: 4 },
              { apiName: "category_id", label: "Category", fieldType: "lookup", sourceColumn: "category_id", writable: true, config: { relatedObjectKey: "category" }, displayOrder: 5 },
              { apiName: "active", label: "Active", fieldType: "boolean", sourceColumn: "active", writable: true, displayOrder: 6 },
              { apiName: "product_kind", label: "Product Kind", fieldType: "picklist", sourceColumn: "product_kind", writable: true, options: ["standard", "variant", "bundle"], displayOrder: 7 },
              { apiName: "parent_product_id", label: "Parent Product", fieldType: "lookup", sourceColumn: "parent_product_id", writable: true, config: { relatedObjectKey: "product", relationshipKey: "variants", preventSelfReference: true }, displayOrder: 8 },
              { apiName: "variant_attributes", label: "Variant Attributes", fieldType: "json", sourceColumn: "variant_attributes", writable: true, displayOrder: 9 },
              { apiName: "image_url", label: "Image", fieldType: "text", sourceColumn: "image_url", writable: true, displayOrder: 10 },
              { apiName: "created_at", label: "Created", fieldType: "datetime", sourceColumn: "created_at", writable: false, displayOrder: 11 },
              { apiName: "updated_at", label: "Updated", fieldType: "datetime", sourceColumn: "updated_at", writable: false, displayOrder: 12 },
            ],
          },
          {
            objectKey: "category",
            metadataScope: "global",
            label: "Category",
            pluralLabel: "Categories",
            description: "Canonical product categories.",
            sourceTable: "categories",
            fields: [
              { apiName: "name", label: "Name", fieldType: "text", sourceColumn: "name", required: true, writable: true, displayOrder: 1 },
              { apiName: "display_order", label: "Display Order", fieldType: "number", sourceColumn: "display_order", writable: true, displayOrder: 2 },
              { apiName: "active", label: "Active", fieldType: "boolean", sourceColumn: "active", writable: true, displayOrder: 3 },
            ],
          },
        ],
        relationships: [
          { parentObjectKey: "category", childObjectKey: "product", relationshipKey: "products", relationshipType: "one_to_many", childFieldApiName: "category_id", required: true },
          { parentObjectKey: "product", childObjectKey: "product", relationshipKey: "variants", relationshipType: "one_to_many", childFieldApiName: "parent_product_id", required: true },
        ],
        listViews: [
          { objectKey: "product", viewKey: "all_products", label: "All Products", columns: ["name", "sku", "barcode", "category_id", "active"], sort: { field: "name", direction: "asc" }, pageSize: 50, isDefault: true },
          { objectKey: "category", viewKey: "all_categories", label: "All Categories", columns: ["name", "display_order", "active"], sort: { field: "display_order", direction: "asc" }, pageSize: 50, isDefault: true },
        ],
        layouts: [
          {
            objectKey: "product",
            layoutKey: "standard_detail",
            pageType: "detail",
            metadataScope: "global",
            name: "Product Record Page",
            isDefault: true,
            definition: {
              presentation_mode: "inline",
              sections: [
                { id: "product_identity", label: "Product Identity", columns: 2, order: 1 },
                { id: "product_category", label: "Category", columns: 1, order: 2 },
                { id: "product_variants", label: "Variants", columns: 1, order: 3 },
              ],
              components: [
                { id: "product_name", type: "field", field_key: "name", section_id: "product_identity", width: "full", order: 1 },
                { id: "product_sku", type: "field", field_key: "sku", section_id: "product_identity", order: 2 },
                { id: "product_barcode", type: "field", field_key: "barcode", section_id: "product_identity", order: 3 },
                { id: "product_kind", type: "field", field_key: "product_kind", section_id: "product_identity", order: 4 },
                { id: "product_status", type: "field", field_key: "active", section_id: "product_identity", order: 5 },
                { id: "product_category_id", type: "field", field_key: "category_id", section_id: "product_category", order: 1 },
                { id: "product_parent_id", type: "field", field_key: "parent_product_id", section_id: "product_variants", order: 1 },
                { id: "product_variant_attributes", type: "field", field_key: "variant_attributes", section_id: "product_variants", order: 2 },
                { id: "product_image", type: "field", field_key: "image_url", section_id: "product_identity", order: 6 },
                { id: "product_variants", type: "related_list", relationship_key: "variants", label: "Variants", columns: ["name", "sku", "barcode", "product_kind", "active"], section_id: "product_variants", order: 3 },
              ],
            },
          },
        ],
        recordForms: [
          {
            objectKey: "product",
            formKey: "product_create",
            layoutKey: "standard_create",
            pageType: "create",
            metadataScope: "global",
            name: "Create Product",
            definition: { presentation_mode: "inline", sections: [{ id: "product_form", label: "Product Details", columns: 2, order: 1 }], components: [] },
          },
          {
            objectKey: "product",
            formKey: "product_edit",
            layoutKey: "standard_edit",
            pageType: "edit",
            metadataScope: "global",
            name: "Edit Product",
            definition: { presentation_mode: "inline", sections: [{ id: "product_form", label: "Product Details", columns: 2, order: 1 }], components: [] },
          },
        ],
        permissionDeclarations: [
          { key: "product_read", permission: "product.view", access: "read" },
          { key: "product_create", permission: "product.create", access: "create" },
          { key: "product_manage", permission: "product.edit", access: "update" },
          { key: "category_read", permission: "category.view", access: "read" },
          { key: "category_create", permission: "category.create", access: "create" },
          { key: "category_manage", permission: "category.edit", access: "update" },
          { key: "category_deactivate", permission: "category.delete", access: "delete" },
          { key: "product_deactivate", permission: "product.delete", access: "delete" },
        ],
        actions: [
          { actionKey: "product.create", objectKey: "product", label: "Create Product", handlerKey: "RECORD_SAVE", requiredPermission: "product.create" },
          { actionKey: "product.update", objectKey: "product", label: "Update Product", handlerKey: "RECORD_SAVE", requiredPermission: "product.edit" },
          { actionKey: "product.activate", objectKey: "product", label: "Activate Product", handlerKey: "RECORD_SAVE", requiredPermission: "product.edit" },
          { actionKey: "product.deactivate", objectKey: "product", label: "Deactivate Product", handlerKey: "RECORD_SAVE", requiredPermission: "product.edit" },
          { actionKey: "product.add_variant", objectKey: "product", label: "Add Variant", handlerKey: "RECORD_SAVE", requiredPermission: "product.create" },
        ],
        rules: [
          {
            objectKey: "product",
            name: "Product name is required",
            triggerKey: "before_save",
            conditions: [{ field: "name", operator: "is_empty" }],
            action: { type: "validation", message: "Product name is required" },
          },
          {
            objectKey: "product",
            name: "Variant requires a parent product",
            triggerKey: "before_save",
            conditions: [
              { field: "product_kind", operator: "equals", value: "variant" },
              { field: "parent_product_id", operator: "is_empty" },
            ],
            action: { type: "validation", message: "A variant must have a parent product" },
          },
          {
            objectKey: "product",
            name: "Only variants can have a parent product",
            triggerKey: "before_save",
            conditions: [
              { field: "product_kind", operator: "not_equals", value: "variant" },
              { field: "parent_product_id", operator: "is_not_empty" },
            ],
            action: { type: "validation", message: "Only a variant can have a parent product" },
          },
        ],
        validationRules: [
          { key: "product_name_required", rule: "Product name is required" },
          { key: "variant_parent_required", rule: "Variant requires a parent product" },
          { key: "parent_only_for_variant", rule: "Only variants can have a parent product" },
          { duplicateIdentity: "Enforced by the existing Product API and active-company unique indexes for SKU and barcode." },
        ],
        migrations: ["product_core.adopt_canonical_metadata.v1"],
      } : {}),
      ...(entry.key === "online_orders" ? {
        metadataOwnership: {
          policy: "PACKAGE_MANAGED",
          preserveUserModified: true,
          requiredTypes: ["object", "field", "relationship", "form", "layout", "workflow", "action", "report", "permission", "connector", "template"],
          objects: ["online_order", "online_order_line"],
          relationships: ["order_lines", "product", "customer", "store"],
          layouts: ["online_order_detail"],
          forms: ["online_order_create", "online_order_edit"],
          listViews: ["all"],
          validations: ["online_order_line_quantity_positive"],
          permissions: ["online_orders.view", "online_orders.manage", "online_orders.status_update", "online_orders.cancel"],
          actions: [
            "online_order.accept",
            "online_order.reject",
            "online_order.prepare",
            "online_order.mark_ready",
            "online_order.mark_ready_for_pickup",
            "online_order.mark_ready_for_delivery",
            "online_order.collect",
            "online_order.complete",
            "online_order.cancel",
          ],
          events: [
            "online_order.created",
            "online_order.accepted",
            "online_order.status_changed",
            "online_order.cancelled",
            "online_order.completed",
          ],
        },
        upgrade: {
          migrationKey: "online_orders_core_1_0_0",
          strategy: "additive",
          preservesRecordIds: true,
          idempotentMetadataProvisioning: true,
        },
        objects: [
          {
            objectKey: "online_order",
            metadataScope: "global",
            label: "Online Order",
            pluralLabel: "Online Orders",
            description: "Canonical provider-neutral online order record.",
            sourceTable: "online_orders",
            required: true,
            fields: [
              { apiName: "external_reference", sourceColumn: "external_reference", label: "Order Reference", fieldType: "text", writable: false },
              { apiName: "external_order_id", sourceColumn: "external_order_id", label: "External Provider Order ID", fieldType: "text", required: true, writable: true },
              { apiName: "platform", sourceColumn: "platform", label: "Provider / Channel", fieldType: "text", required: true, writable: true, config: { normalizedProviderKey: true, allowFutureProviders: true } },
              { apiName: "company_id", sourceColumn: "company_id", label: "Company", fieldType: "lookup", required: true, writable: false },
              { apiName: "store_id", sourceColumn: "store_id", label: "Store", fieldType: "lookup", writable: true },
              { apiName: "customer_id", sourceColumn: "customer_id", label: "Customer", fieldType: "lookup", writable: false },
              { apiName: "customer_name", sourceColumn: "customer_name", label: "Customer Name", fieldType: "text", writable: true },
              { apiName: "customer_phone", sourceColumn: "customer_phone", label: "Customer Phone", fieldType: "phone", writable: true },
              { apiName: "customer_email", sourceColumn: "customer_email", label: "Customer Email", fieldType: "email", writable: true },
              { apiName: "fulfilment_type", sourceColumn: "fulfilment_type", label: "Fulfilment", fieldType: "picklist", required: true, writable: true, options: ["SELF_PICKUP", "DELIVERY"] },
              { apiName: "status", sourceColumn: "status", label: "Status", fieldType: "picklist", required: true, writable: true, options: ["RECEIVED", "ACCEPTED", "PREPARING", "READY", "READY_FOR_PICKUP", "READY_FOR_DELIVERY", "COLLECTED", "COMPLETED", "REJECTED", "CANCELLED"] },
              { apiName: "subtotal", sourceColumn: "subtotal", label: "Subtotal", fieldType: "currency", writable: true },
              { apiName: "tax", sourceColumn: "tax", label: "Tax", fieldType: "currency", writable: true },
              { apiName: "total", sourceColumn: "total", label: "Total", fieldType: "currency", writable: true },
              { apiName: "notes", sourceColumn: "notes", label: "Notes", fieldType: "text", writable: true },
              { apiName: "delivery_address", sourceColumn: "delivery_address", label: "Delivery Address", fieldType: "text", writable: false },
              { apiName: "created_at", sourceColumn: "created_at", label: "Created", fieldType: "datetime", writable: false },
              { apiName: "updated_at", sourceColumn: "updated_at", label: "Updated", fieldType: "datetime", writable: false },
            ],
          },
          {
            objectKey: "online_order_line",
            metadataScope: "global",
            label: "Online Order Line",
            pluralLabel: "Online Order Lines",
            description: "Existing online order item rows and Product Core references.",
            sourceTable: "online_order_items",
            required: true,
            fields: [
              { apiName: "order_id", sourceColumn: "order_id", label: "Online Order", fieldType: "lookup", required: true, writable: true },
              { apiName: "product_id", sourceColumn: "product_id", label: "Product", fieldType: "lookup", writable: true },
              { apiName: "product_name", sourceColumn: "product_name", label: "Product Name", fieldType: "text", required: true, writable: true },
              { apiName: "external_item_id", sourceColumn: "external_item_id", label: "External Item ID", fieldType: "text", writable: false },
              { apiName: "quantity", sourceColumn: "quantity", label: "Quantity", fieldType: "decimal", required: true, writable: true, config: { minimum: 0.001 } },
              { apiName: "unit_price", sourceColumn: "unit_price", label: "Unit Price", fieldType: "currency", required: true, writable: true },
              { apiName: "tax", sourceColumn: "tax", label: "Tax", fieldType: "currency", writable: false },
              { apiName: "total", sourceColumn: "total", label: "Line Total", fieldType: "currency", required: true, writable: false },
              { apiName: "mapping_status", sourceColumn: "mapping_status", label: "Product Mapping", fieldType: "picklist", required: true, writable: false, options: ["MAPPED", "UNMAPPED"] },
              { apiName: "platform_data", sourceColumn: "platform_data", label: "Provider Item Data", fieldType: "json", writable: false },
              { apiName: "created_at", sourceColumn: "created_at", label: "Created", fieldType: "datetime", writable: false },
            ],
          },
        ],
        relationships: [
          { parentObjectKey: "online_order", childObjectKey: "online_order_line", relationshipKey: "order_lines", relationshipType: "one_to_many", childFieldApiName: "order_id", required: true },
          { parentObjectKey: "online_order_line", childObjectKey: "product", relationshipKey: "product", relationshipType: "lookup", childFieldApiName: "product_id" },
          { parentObjectKey: "customer", childObjectKey: "online_order", relationshipKey: "online_orders", relationshipType: "one_to_many", childFieldApiName: "customer_id" },
          { parentObjectKey: "store", childObjectKey: "online_order", relationshipKey: "online_orders", relationshipType: "one_to_many", childFieldApiName: "store_id" },
        ],
        listViews: [
          {
            objectKey: "online_order",
            viewKey: "all",
            label: "All Online Orders",
            columns: ["external_reference", "external_order_id", "platform", "store_id", "fulfilment_type", "status", "total", "created_at"],
            sort: { field: "created_at", direction: "desc" },
            pageSize: 50,
            isDefault: true,
          },
        ],
        layouts: [
          {
            objectKey: "online_order",
            layoutKey: "online_order_detail",
            pageType: "detail",
            name: "Online Order Details",
            isDefault: true,
            required: true,
            definition: {
              sections: [{ id: "order-details", label: "Order Details", order: 0, columns: 2, visible: true }],
              components: [
                ...["external_reference", "external_order_id", "platform", "store_id", "customer_id", "customer_name", "fulfilment_type", "status", "subtotal", "tax", "total", "created_at"].map((fieldKey, order) => ({
                  id: `field-${fieldKey}`,
                  type: "field",
                  field_key: fieldKey,
                  section_id: "order-details",
                  order,
                  width: "1/2",
                  visible: true,
                  readOnly: true,
                })),
                { id: "related-order-lines", type: "related_list", relationship_key: "order_lines", label: "Order Lines", visible: true },
              ],
            },
          },
        ],
        forms: [
          {
            objectKey: "online_order",
            formKey: "online_order_create",
            pageType: "create",
            name: "Online Order Create",
            fields: ["external_order_id", "platform", "store_id", "customer_id", "fulfilment_type", "status"],
          },
          {
            objectKey: "online_order",
            formKey: "online_order_edit",
            pageType: "edit",
            name: "Online Order Edit",
            fields: ["external_reference", "external_order_id", "platform", "store_id", "customer_id", "fulfilment_type", "status", "notes"],
          },
        ],
        validationRules: [
          {
            objectKey: "online_order_line",
            name: "online_order_line_quantity_positive",
            triggerKey: "before_create",
            conditions: [{ field: "quantity", operator: "less_than", value: 0.001 }],
            action: { message: "Order line quantity must be greater than zero." },
            required: true,
          },
        ],
        permissionDeclarations: [
          { key: "online_order_read", permission: "online_orders.view", access: "read" },
          { key: "online_order_lifecycle", permission: "online_orders.manage", access: "execute" },
        ],
        workflows: [
          {
            objectKey: "online_order",
            name: "Online Order Transition",
            apiName: "ONLINE_ORDER_TRANSITION",
            triggerKey: "manual",
            active: true,
            lifecycleStatus: "ACTIVE",
            inputContract: [
              { name: "orderId", label: "Order ID", type: "text", required: true },
              { name: "toStatus", label: "Target Status", type: "text", required: true },
            ],
            actions: [
              {
                id: "update_online_order_status",
                label: "Update Online Order Status",
                apiName: "update_online_order_status",
                key: "UPDATE_RECORD",
                objectKey: "online_order",
                recordId: { path: "$record.id" },
                fieldValues: { status: { path: "$record.toStatus" } },
              },
            ],
          },
        ],
        actions: [
          { actionKey: "online_order.accept", objectKey: "online_order", label: "Accept Order", handlerKey: "RUN_SUBFLOW", requiredPermission: "online_orders.manage", config: { subflowApiName: "ONLINE_ORDER_TRANSITION", inputMappings: { orderId: { path: "record.id" }, toStatus: "PREPARING" } } },
          { actionKey: "online_order.reject", objectKey: "online_order", label: "Reject Order", handlerKey: "RUN_SUBFLOW", requiredPermission: "online_orders.manage", config: { subflowApiName: "ONLINE_ORDER_TRANSITION", inputMappings: { orderId: { path: "record.id" }, toStatus: "REJECTED" } } },
          { actionKey: "online_order.prepare", objectKey: "online_order", label: "Prepare Order", handlerKey: "RUN_SUBFLOW", requiredPermission: "online_orders.manage", config: { subflowApiName: "ONLINE_ORDER_TRANSITION", inputMappings: { orderId: { path: "record.id" }, toStatus: "PREPARING" } } },
          { actionKey: "online_order.mark_ready", objectKey: "online_order", label: "Mark Ready", handlerKey: "RUN_SUBFLOW", requiredPermission: "online_orders.manage", config: { subflowApiName: "ONLINE_ORDER_TRANSITION", inputMappings: { orderId: { path: "record.id" }, toStatus: "READY" } } },
          { actionKey: "online_order.mark_ready_for_pickup", objectKey: "online_order", label: "Mark Ready for Pickup", handlerKey: "RUN_SUBFLOW", requiredPermission: "online_orders.manage", config: { subflowApiName: "ONLINE_ORDER_TRANSITION", inputMappings: { orderId: { path: "record.id" }, toStatus: "READY_FOR_PICKUP" } } },
          { actionKey: "online_order.mark_ready_for_delivery", objectKey: "online_order", label: "Mark Ready for Delivery", handlerKey: "RUN_SUBFLOW", requiredPermission: "online_orders.manage", config: { subflowApiName: "ONLINE_ORDER_TRANSITION", inputMappings: { orderId: { path: "record.id" }, toStatus: "READY_FOR_DELIVERY" } } },
          { actionKey: "online_order.collect", objectKey: "online_order", label: "Collect Order", handlerKey: "RUN_SUBFLOW", requiredPermission: "online_orders.manage", config: { subflowApiName: "ONLINE_ORDER_TRANSITION", inputMappings: { orderId: { path: "record.id" }, toStatus: "COLLECTED" } } },
          { actionKey: "online_order.complete", objectKey: "online_order", label: "Complete Order", handlerKey: "RUN_SUBFLOW", requiredPermission: "online_orders.manage", config: { subflowApiName: "ONLINE_ORDER_TRANSITION", inputMappings: { orderId: { path: "record.id" }, toStatus: "COMPLETED" } } },
          { actionKey: "online_order.cancel", objectKey: "online_order", label: "Cancel Order", handlerKey: "RUN_SUBFLOW", requiredPermission: "online_orders.manage", config: { subflowApiName: "ONLINE_ORDER_TRANSITION", inputMappings: { orderId: { path: "record.id" }, toStatus: "CANCELLED" } } },
        ],
        buttons: [
          { buttonKey: "online_order_accept", objectKey: "online_order", label: "Accept Order", actionKey: "online_order.accept", requiredPermission: "online_orders.manage", variant: "primary", visibilityRule: { path: "status", operator: "equals", value: "RECEIVED" }, config: { uiAction: "accept", busyLabel: "Accepting...", prepVisible: false, order: 10 } },
          { buttonKey: "online_order_reject", objectKey: "online_order", label: "Reject", actionKey: "online_order.reject", requiredPermission: "online_orders.manage", variant: "danger", visibilityRule: { path: "status", operator: "equals", value: "RECEIVED" }, config: { uiAction: "reject", busyLabel: "Rejecting...", prepVisible: false, order: 20 } },
          { buttonKey: "online_order_ready", objectKey: "online_order", label: "Mark Ready", actionKey: "online_order.mark_ready", requiredPermission: "online_orders.manage", variant: "secondary", visibilityRule: { path: "status", operator: "in", value: ["ACCEPTED", "PREPARING"] }, config: { uiAction: "ready", busyLabel: "Marking ready...", prepVisible: true, order: 30 } },
          { buttonKey: "online_order_complete", objectKey: "online_order", label: "Complete Order", actionKey: "online_order.complete", requiredPermission: "online_orders.manage", variant: "primary", visibilityRule: { path: "status", operator: "equals", value: "READY" }, config: { uiAction: "complete", busyLabel: "Completing...", prepVisible: true, order: 40 } },
          { buttonKey: "online_order_cancel", objectKey: "online_order", label: "Cancel", actionKey: "online_order.cancel", requiredPermission: "online_orders.manage", variant: "danger", visibilityRule: { path: "status", operator: "in", value: ["RECEIVED", "ACCEPTED", "PREPARING", "READY"] }, config: { uiAction: "cancel", busyLabel: "Cancelling...", prepVisible: true, order: 50 } },
          { buttonKey: "online_order_prepare", objectKey: "online_order", label: "Prepare", actionKey: "online_order.prepare", requiredPermission: "online_orders.manage", variant: "secondary", visibilityRule: { path: "status", operator: "equals", value: "__generic_only__" }, config: { uiAction: "prepare", order: 60, hiddenFromProviderQueue: true } },
          { buttonKey: "online_order_ready_pickup", objectKey: "online_order", label: "Ready for Pickup", actionKey: "online_order.mark_ready_for_pickup", requiredPermission: "online_orders.manage", variant: "secondary", visibilityRule: { path: "status", operator: "equals", value: "__generic_only__" }, config: { uiAction: "ready_pickup", order: 70, hiddenFromProviderQueue: true } },
          { buttonKey: "online_order_ready_delivery", objectKey: "online_order", label: "Ready for Delivery", actionKey: "online_order.mark_ready_for_delivery", requiredPermission: "online_orders.manage", variant: "secondary", visibilityRule: { path: "status", operator: "equals", value: "__generic_only__" }, config: { uiAction: "ready_delivery", order: 80, hiddenFromProviderQueue: true } },
          { buttonKey: "online_order_collect", objectKey: "online_order", label: "Collect", actionKey: "online_order.collect", requiredPermission: "online_orders.manage", variant: "secondary", visibilityRule: { path: "status", operator: "equals", value: "__generic_only__" }, config: { uiAction: "collect", order: 90, hiddenFromProviderQueue: true } },
        ],
        events: [
          { eventType: "online_order.created", description: "A canonical online order was created." },
          { eventType: "online_order.accepted", description: "A canonical online order was accepted." },
          { eventType: "online_order.status_changed", description: "A canonical online order status changed." },
          { eventType: "online_order.cancelled", description: "A canonical online order was cancelled." },
          { eventType: "online_order.completed", description: "A canonical online order was completed." },
        ],
      } : {}),
      ...(entry.key === "platform" ? {
        objects: [
          {
            objectKey: "system_settings",
            label: "System Settings",
            pluralLabel: "System Settings",
            description: "Canonical company-wide onePOS configuration. All Settings UI reads and writes these existing company_settings values through Platform Object metadata.",
            sourceTable: "company_settings",
            config: { settingsHost: true, settingsGroup: "System", settingsLabel: "System Settings", settingsOrder: 10, settingsSectionSource: "field-config" },
            metadataScope: "global",
            fieldsMetadataScope: "global",
            fields: [
              { apiName: "id", label: "ID", fieldType: "lookup", sourceColumn: "id", writable: false },
              { apiName: "company_id", label: "Company", fieldType: "lookup", sourceColumn: "company_id", required: true, writable: false },
              { apiName: "date_format", label: "Date Format", fieldType: "select", sourceColumn: "date_format", required: true, writable: true, options: ["DD/MM/YYYY","MM/DD/YYYY","YYYY-MM-DD"], config: { settingsSection: "General" } },
              { apiName: "vat_enabled", label: "VAT Enabled", fieldType: "boolean", sourceColumn: "vat_enabled", required: true, writable: true, config: { settingsSection: "Tax / VAT" } },
              { apiName: "default_vat_rate", label: "Default VAT Rate", fieldType: "decimal", sourceColumn: "default_vat_rate", required: true, writable: true, config: { settingsSection: "Tax / VAT", suffix: "%" } },
              { apiName: "loyalty_enabled", label: "Loyalty Enabled", fieldType: "boolean", sourceColumn: "loyalty_enabled", required: true, writable: true, config: { settingsSection: "Customer Loyalty" } },
              { apiName: "loyalty_earning_rate", label: "Loyalty Earning Rate", fieldType: "decimal", sourceColumn: "loyalty_earning_rate", required: true, writable: true, config: { settingsSection: "Customer Loyalty" } },
              { apiName: "loyalty_min_sale_total", label: "Minimum Sale Total", fieldType: "currency", sourceColumn: "loyalty_min_sale_total", writable: true, config: { settingsSection: "Customer Loyalty" } },
              { apiName: "loyalty_redeem_value_per_point", label: "Redeem Value Per Point", fieldType: "currency", sourceColumn: "loyalty_redeem_value_per_point", writable: true, config: { settingsSection: "Customer Loyalty" } },
              { apiName: "loyalty_min_points_redeem", label: "Minimum Points To Redeem", fieldType: "number", sourceColumn: "loyalty_min_points_redeem", writable: true, config: { settingsSection: "Customer Loyalty" } },
              { apiName: "allow_negative_inventory_billing", label: "Allow Negative Inventory Billing", fieldType: "boolean", sourceColumn: "allow_negative_inventory_billing", writable: true, config: { settingsSection: "Store & Till" } },
              { apiName: "scan_go_enabled", label: "Scan & Go Enabled", fieldType: "boolean", sourceColumn: "scan_go_enabled", writable: true, config: { settingsSection: "Store & Till" } },
              { apiName: "exchange_mode", label: "Exchange Mode", fieldType: "select", sourceColumn: "exchange_mode", writable: true, options: ["receipt","normal","both"], config: { settingsSection: "Store & Till" } },
              { apiName: "batch_inventory_mode", label: "Batch Inventory Mode", fieldType: "select", sourceColumn: "batch_inventory_mode", writable: true, options: ["required_dates","optional_dates","none"], config: { settingsSection: "Store & Till" } },
              { apiName: "batch_default_mfg_rule", label: "Default Manufacturing Date Rule", fieldType: "text", sourceColumn: "batch_default_mfg_rule", writable: true, config: { settingsSection: "Store & Till" } },
              { apiName: "batch_default_expiry_rule", label: "Default Expiry Rule", fieldType: "text", sourceColumn: "batch_default_expiry_rule", writable: true, config: { settingsSection: "Store & Till" } },
              { apiName: "batch_default_expiry_days", label: "Default Expiry Days", fieldType: "number", sourceColumn: "batch_default_expiry_days", writable: true, config: { settingsSection: "Store & Till" } },
              { apiName: "product_view", label: "Product View", fieldType: "select", sourceColumn: "product_view", writable: true, options: ["image","compact"], config: { settingsSection: "Store & Till" } },
              { apiName: "dock_quick_access", label: "Dock Quick Access", fieldType: "multiselect", sourceColumn: "dock_quick_access", writable: true, options: ["Dashboard","Sales","Returns","Supplier Returns","Order Prep","Payments","Products","Global Products","Categories","Purchases","Suppliers","Inventory","Replenishment","Customers","Employees","Stores","Reports","Integrations","Accounting","Settings"], config: { settingsSection: "General", maxSelections: 8 } },
              { apiName: "customer_display_enabled", label: "Customer Display Enabled", fieldType: "boolean", sourceColumn: "customer_display_enabled", writable: true, config: { settingsSection: "Hardware" } },
              { apiName: "online_ordering_enabled", label: "Online Ordering Enabled", fieldType: "boolean", sourceColumn: "online_ordering_enabled", writable: true, config: { settingsSection: "Client Web Shop" } },
              { apiName: "online_payment_methods", label: "Online Payment Methods", fieldType: "multiselect", sourceColumn: "online_payment_methods", writable: true, config: { settingsSection: "Client Web Shop" } },
              { apiName: "client_web_shop_enabled", label: "Client Web Shop Enabled", fieldType: "boolean", sourceColumn: "client_web_shop_enabled", writable: true, config: { settingsSection: "Client Web Shop" } },
              { apiName: "client_web_shop_slug", label: "Shop Slug", fieldType: "text", sourceColumn: "client_web_shop_slug", writable: true, config: { settingsSection: "Client Web Shop" } },
              { apiName: "client_web_shop_name", label: "Shop Name", fieldType: "text", sourceColumn: "client_web_shop_name", writable: true, config: { settingsSection: "Client Web Shop" } },
              { apiName: "client_web_shop_store_id", label: "Web Shop Store", fieldType: "lookup", sourceColumn: "client_web_shop_store_id", writable: true, config: { settingsSection: "Client Web Shop", relatedObjectKey: "store" } },
              { apiName: "client_web_shop_price_list_id", label: "Web Shop Price List", fieldType: "lookup", sourceColumn: "client_web_shop_price_list_id", writable: true, config: { settingsSection: "Client Web Shop", relatedObjectKey: "price_list" } },
              { apiName: "client_web_shop_pickup_enabled", label: "Pickup Enabled", fieldType: "boolean", sourceColumn: "client_web_shop_pickup_enabled", writable: true, config: { settingsSection: "Client Web Shop" } },
              { apiName: "client_web_shop_delivery_enabled", label: "Delivery Enabled", fieldType: "boolean", sourceColumn: "client_web_shop_delivery_enabled", writable: true, config: { settingsSection: "Client Web Shop" } },
              { apiName: "client_web_shop_own_delivery_enabled", label: "Own Delivery Enabled", fieldType: "boolean", sourceColumn: "client_web_shop_own_delivery_enabled", writable: true, config: { settingsSection: "Client Web Shop" } },
              { apiName: "client_web_shop_minimum_order", label: "Minimum Order", fieldType: "currency", sourceColumn: "client_web_shop_minimum_order", writable: true, config: { settingsSection: "Client Web Shop" } },
              { apiName: "client_web_shop_delivery_fee", label: "Delivery Fee", fieldType: "currency", sourceColumn: "client_web_shop_delivery_fee", writable: true, config: { settingsSection: "Client Web Shop" } },
              { apiName: "client_web_shop_guest_checkout", label: "Guest Checkout", fieldType: "boolean", sourceColumn: "client_web_shop_guest_checkout", writable: true, config: { settingsSection: "Client Web Shop" } },
              { apiName: "client_web_shop_sandbox_payments_enabled", label: "Sandbox Payments", fieldType: "boolean", sourceColumn: "client_web_shop_sandbox_payments_enabled", writable: true, config: { settingsSection: "Client Web Shop" } },
              { apiName: "till_invoice_prefix", label: "Till Invoice Prefix", fieldType: "text", sourceColumn: "till_invoice_prefix", writable: true, config: { settingsSection: "Receipts" } },
              { apiName: "delivery_invoice_prefix", label: "Delivery Invoice Prefix", fieldType: "text", sourceColumn: "delivery_invoice_prefix", writable: true, config: { settingsSection: "Receipts" } },
              { apiName: "self_checkout_invoice_prefix", label: "Self Checkout Invoice Prefix", fieldType: "text", sourceColumn: "self_checkout_invoice_prefix", writable: true, config: { settingsSection: "Receipts" } },
              { apiName: "receipt_qr_show_after_payment", label: "Receipt QR After Payment", fieldType: "select", sourceColumn: "receipt_qr_show_after_payment", writable: true, options: ["OFF","ALWAYS","ONLY_WHEN_PRINTER_UNAVAILABLE"], config: { settingsSection: "Receipts" } },
              { apiName: "receipt_qr_expiry_minutes", label: "Receipt QR Expiry Minutes", fieldType: "number", sourceColumn: "receipt_qr_expiry_minutes", writable: true, config: { settingsSection: "Receipts" } },
              { apiName: "receipt_qr_allow_manual", label: "Allow Manual Receipt QR", fieldType: "boolean", sourceColumn: "receipt_qr_allow_manual", writable: true, config: { settingsSection: "Receipts" } },
              { apiName: "receipt_qr_allow_regenerate", label: "Allow Receipt QR Regenerate", fieldType: "boolean", sourceColumn: "receipt_qr_allow_regenerate", writable: true, config: { settingsSection: "Receipts" } },
              { apiName: "receipt_qr_auto_close_on_new_sale", label: "Close Receipt QR On New Sale", fieldType: "boolean", sourceColumn: "receipt_qr_auto_close_on_new_sale", writable: true, config: { settingsSection: "Receipts" } },
              { apiName: "receipt_qr_show_countdown", label: "Show Receipt QR Countdown", fieldType: "boolean", sourceColumn: "receipt_qr_show_countdown", writable: true, config: { settingsSection: "Receipts" } },
              { apiName: "receipt_qr_download_filename_format", label: "Receipt Filename Format", fieldType: "text", sourceColumn: "receipt_qr_download_filename_format", writable: true, config: { settingsSection: "Receipts" } },
              { apiName: "default_landing_page", label: "Default Landing Page", fieldType: "text", sourceColumn: "default_landing_page", writable: true, config: { settingsSection: "General" } },
                            { apiName: "domain_users_only", label: "Domain Users Only", fieldType: "boolean", sourceColumn: "domain_users_only", writable: true, config: { settingsSection: "Users" } },
              { apiName: "email_registration_enabled", label: "Email Registration Enabled", fieldType: "boolean", sourceColumn: "email_registration_enabled", writable: true, config: { settingsSection: "Users" } },
              { apiName: "password_reset_email_enabled", label: "Password Reset Email Enabled", fieldType: "boolean", sourceColumn: "password_reset_email_enabled", writable: true, config: { settingsSection: "Users" } },
              { apiName: "registration_link_expiry_minutes", label: "Registration Link Expiry Minutes", fieldType: "number", sourceColumn: "registration_link_expiry_minutes", writable: true, config: { settingsSection: "Users" } },
              { apiName: "password_reset_expiry_minutes", label: "Password Reset Expiry Minutes", fieldType: "number", sourceColumn: "password_reset_expiry_minutes", writable: true, config: { settingsSection: "Users" } },
              { apiName: "updated_at", label: "Updated", fieldType: "datetime", sourceColumn: "updated_at", writable: false }
            ],
          },
          {
            objectKey: "server_setting",
            label: "Server Setting",
            pluralLabel: "Server Settings",
            description: "Per-device backend origin used by onePOS clients. Metadata drives the Settings UI; the selected device record is mirrored locally so the client can reach its configured backend on the next request.",
            sourceTable: "server_settings",
            config: {
              settingsHost: true,
              settingsGroup: "System",
              settingsLabel: "Server / API Configuration",
              settingsOrder: 300,
              settingsAllowDelete: false,
              settingsDeviceScoped: true,
              settingsDeviceKeyField: "device_key",
              settingsServerUrlField: "server_url"
            },
            metadataScope: "global",
            fieldsMetadataScope: "global",
            fields: [
              { apiName: "id", label: "ID", fieldType: "lookup", sourceColumn: "id", writable: false },
              { apiName: "company_id", label: "Company", fieldType: "lookup", sourceColumn: "company_id", writable: false },
              { apiName: "device_key", label: "Device Key", fieldType: "text", sourceColumn: "device_key", required: true, writable: true, config: { settingsHidden: true, defaultFromDeviceKey: true } },
              { apiName: "device_name", label: "Device Name", fieldType: "text", sourceColumn: "device_name", writable: true, config: { defaultFromDeviceName: true } },
              { apiName: "server_url", label: "Server URL", fieldType: "text", sourceColumn: "server_url", writable: true },
              { apiName: "active", label: "Active", fieldType: "boolean", sourceColumn: "active", writable: true, config: { defaultValue: true } },
              { apiName: "updated_at", label: "Updated", fieldType: "datetime", sourceColumn: "updated_at", writable: false }
            ],
          },
          {
            objectKey: "payment_terminal",
            label: "Payment Terminal",
            pluralLabel: "Payment Terminals",
            description: "Company payment terminals exposed through Platform metadata without exposing stored credentials.",
            sourceTable: "payment_terminals",
            config: { settingsHost: true, settingsGroup: "Sales & Tax", settingsLabel: "Payment Terminals", settingsOrder: 80 },
            metadataScope: "global",
            fieldsMetadataScope: "global",
            fields: [
              { apiName: "id", label: "ID", fieldType: "lookup", sourceColumn: "id", writable: false },
              { apiName: "company_id", label: "Company", fieldType: "lookup", sourceColumn: "company_id", writable: false },
              { apiName: "store_id", label: "Store", fieldType: "lookup", sourceColumn: "store_id", required: true, writable: true, config: { relatedObjectKey: "store" } },
              { apiName: "provider", label: "Provider", fieldType: "text", sourceColumn: "provider", required: true, writable: true },
              { apiName: "name", label: "Name", fieldType: "text", sourceColumn: "name", required: true, writable: true },
              { apiName: "terminal_identifier", label: "Terminal ID", fieldType: "text", sourceColumn: "terminal_identifier", writable: true },
              { apiName: "connection_url", label: "Connection URL", fieldType: "text", sourceColumn: "connection_url", writable: true },
              { apiName: "active", label: "Active", fieldType: "boolean", sourceColumn: "active", writable: true, config: { defaultValue: true } },
              { apiName: "last_test_result", label: "Last Test Result", fieldType: "text", sourceColumn: "last_test_result", writable: false },
              { apiName: "last_tested_at", label: "Last Tested", fieldType: "datetime", sourceColumn: "last_tested_at", writable: false },
              { apiName: "created_at", label: "Created", fieldType: "datetime", sourceColumn: "created_at", writable: false },
              { apiName: "updated_at", label: "Updated", fieldType: "datetime", sourceColumn: "updated_at", writable: false }
            ],
          },
          {
            objectKey: "hardware_configuration",
            label: "Hardware Configuration",
            pluralLabel: "Hardware",
            description: "Store-scoped scanner, cash drawer and receipt-printer configuration.",
            sourceTable: "hardware_configurations",
            storeScoped: true,
            config: { settingsHost: true, settingsGroup: "Hardware", settingsLabel: "Hardware", settingsOrder: 100 },
            metadataScope: "global",
            fieldsMetadataScope: "global",
            fields: [
              { apiName: "id", label: "ID", fieldType: "lookup", sourceColumn: "id", writable: false },
              { apiName: "company_id", label: "Company", fieldType: "lookup", sourceColumn: "company_id", writable: false },
              { apiName: "store_id", label: "Store", fieldType: "lookup", sourceColumn: "store_id", writable: false, config: { relatedObjectKey: "store" } },
              { apiName: "device_type", label: "Device Type", fieldType: "select", sourceColumn: "device_type", required: true, writable: true, options: ["BARCODE_SCANNER","CASH_DRAWER","RECEIPT_PRINTER"] },
              { apiName: "device_name", label: "Device Name", fieldType: "text", sourceColumn: "device_name", writable: true },
              { apiName: "connection_type", label: "Connection Type", fieldType: "text", sourceColumn: "connection_type", writable: true },
              { apiName: "connection_address", label: "Connection Address", fieldType: "text", sourceColumn: "connection_address", writable: true },
              { apiName: "paper_width", label: "Paper Width", fieldType: "text", sourceColumn: "paper_width", writable: true },
              { apiName: "is_default", label: "Default Device", fieldType: "boolean", sourceColumn: "is_default", writable: true },
              { apiName: "active", label: "Active", fieldType: "boolean", sourceColumn: "active", writable: true, config: { defaultValue: true } },
              { apiName: "last_test_result", label: "Last Test Result", fieldType: "text", sourceColumn: "last_test_result", writable: false },
              { apiName: "last_tested_at", label: "Last Tested", fieldType: "datetime", sourceColumn: "last_tested_at", writable: false }
            ],
          },
          {
            objectKey: "integration",
            label: "Connection",
            pluralLabel: "Connections",
            description: "Company integration records. Secret provider configuration remains protected behind provider-specific commands and is never exposed as a Platform field.",
            sourceTable: "integrations",
            config: { settingsHost: true, settingsGroup: "Integrations", settingsLabel: "Connections", settingsOrder: 230, settingsAllowCreate: false, settingsAllowDelete: false },
            metadataScope: "global",
            fieldsMetadataScope: "global",
            fields: [
              { apiName: "id", label: "ID", fieldType: "lookup", sourceColumn: "id", writable: false },
              { apiName: "company_id", label: "Company", fieldType: "lookup", sourceColumn: "company_id", writable: false },
              { apiName: "name", label: "Name", fieldType: "text", sourceColumn: "name", required: true, writable: false },
              { apiName: "provider", label: "Provider", fieldType: "text", sourceColumn: "provider", required: true, writable: false },
              { apiName: "active", label: "Active", fieldType: "boolean", sourceColumn: "active", writable: false },
              { apiName: "created_at", label: "Created", fieldType: "datetime", sourceColumn: "created_at", writable: false },
              { apiName: "updated_at", label: "Updated", fieldType: "datetime", sourceColumn: "updated_at", writable: false }
            ],
          },
          {
            objectKey: "message_template",
            label: "Message Template",
            pluralLabel: "Message Templates",
            description: "Metadata-driven EMAIL, SMS and WhatsApp templates used by Platform actions.",
            sourceTable: "platform_message_templates",
            config: { settingsHost: true, settingsGroup: "Platform", settingsLabel: "Message Templates", settingsOrder: 310 },
            metadataScope: "global",
            fieldsMetadataScope: "global",
            fields: [
              { apiName: "id", label: "ID", fieldType: "lookup", sourceColumn: "id", writable: false },
              { apiName: "company_id", label: "Company", fieldType: "lookup", sourceColumn: "company_id", writable: false },
              { apiName: "name", label: "Name", fieldType: "text", sourceColumn: "name", required: true, writable: true },
              { apiName: "api_key", label: "API Key", fieldType: "text", sourceColumn: "api_key", required: true, writable: true },
              { apiName: "description", label: "Description", fieldType: "text", sourceColumn: "description", writable: true },
              { apiName: "channel", label: "Channel", fieldType: "select", sourceColumn: "channel", required: true, writable: true, options: ["EMAIL","SMS","WHATSAPP"] },
              { apiName: "object_id", label: "Object", fieldType: "lookup", sourceColumn: "object_id", writable: true },
              { apiName: "subject", label: "Subject", fieldType: "text", sourceColumn: "subject", writable: true },
              { apiName: "body", label: "Body", fieldType: "text", sourceColumn: "body", required: true, writable: true },
              { apiName: "active", label: "Active", fieldType: "boolean", sourceColumn: "active", writable: true, config: { defaultValue: true } },
              { apiName: "created_at", label: "Created", fieldType: "datetime", sourceColumn: "created_at", writable: false },
              { apiName: "updated_at", label: "Updated", fieldType: "datetime", sourceColumn: "updated_at", writable: false }
            ],
          },
          {
            objectKey: "role",
            label: "Role",
            pluralLabel: "Roles",
            description: "Tenant roles used by RBAC.",
            sourceTable: "roles",
            config: { settingsHost: true, settingsGroup: "Users", settingsLabel: "Roles & Permissions", settingsOrder: 210 },
            metadataScope: "global",
            fieldsMetadataScope: "global",
            fields: [
              { apiName: "id", label: "ID", fieldType: "lookup", sourceColumn: "id", writable: false },
              { apiName: "company_id", label: "Company", fieldType: "lookup", sourceColumn: "company_id", writable: false },
              { apiName: "name", label: "Name", fieldType: "text", sourceColumn: "name", required: true, writable: true },
              { apiName: "api_key", label: "API Key", fieldType: "text", sourceColumn: "api_key", writable: false },
              { apiName: "description", label: "Description", fieldType: "text", sourceColumn: "description", writable: true },
              { apiName: "parent_role_id", label: "Parent Role", fieldType: "lookup", sourceColumn: "parent_role_id", writable: true, config: { relatedObjectKey: "role" } },
              { apiName: "default_landing_page", label: "Default Landing Page", fieldType: "text", sourceColumn: "default_landing_page", writable: true },
              { apiName: "is_system_role", label: "System Role", fieldType: "boolean", sourceColumn: "is_system_role", writable: false },
              { apiName: "created_at", label: "Created", fieldType: "datetime", sourceColumn: "created_at", writable: false }
            ],
          },
          {
            objectKey: "permission",
            label: "Permission",
            pluralLabel: "Permissions",
            description: "Global permission catalogue. Permission definitions are read-only metadata.",
            sourceTable: "permissions",
            config: { settingsHost: false, settingsParentObjectKey: "role" },
            companyScoped: false,
            metadataScope: "global",
            fieldsMetadataScope: "global",
            fields: [
              { apiName: "id", label: "ID", fieldType: "lookup", sourceColumn: "id", writable: false },
              { apiName: "code", label: "Code", fieldType: "text", sourceColumn: "code", required: true, writable: false },
              { apiName: "name", label: "Name", fieldType: "text", sourceColumn: "name", required: true, writable: false },
              { apiName: "description", label: "Description", fieldType: "text", sourceColumn: "description", writable: false }
            ],
          },
          {
            objectKey: "role_permission",
            label: "Role Permission",
            pluralLabel: "Role Permissions",
            description: "Metadata-driven role to permission assignments.",
            sourceTable: "role_permissions",
            config: { settingsHost: true, settingsGroup: "Users", settingsLabel: "Permission Assignments", settingsOrder: 211, settingsParentObjectKey: "role", settingsAllowDelete: true },
            metadataScope: "global",
            fieldsMetadataScope: "global",
            fields: [
              { apiName: "id", label: "ID", fieldType: "lookup", sourceColumn: "id", writable: false },
              { apiName: "company_id", label: "Company", fieldType: "lookup", sourceColumn: "company_id", writable: false },
              { apiName: "role_id", label: "Role", fieldType: "lookup", sourceColumn: "role_id", required: true, writable: true, config: { relatedObjectKey: "role" } },
              { apiName: "permission_id", label: "Permission", fieldType: "lookup", sourceColumn: "permission_id", required: true, writable: true, config: { relatedObjectKey: "permission" } }
            ],
          },

          {
            objectKey: "payment_terminal",
            label: "Payment Terminal",
            pluralLabel: "Payment Terminals",
            description: "Company card terminals and connection settings.",
            sourceTable: "payment_terminals",
            config: { settingsHost: true, settingsGroup: "Sales & Tax", settingsLabel: "Payment Terminals", settingsOrder: 70, settingsAllowDelete: true },
            metadataScope: "global",
            fieldsMetadataScope: "global",
            fields: [
              { apiName: "company_id", label: "Company", fieldType: "lookup", sourceColumn: "company_id", writable: false },
              { apiName: "store_id", label: "Store", fieldType: "lookup", sourceColumn: "store_id", writable: true, config: { relatedObjectKey: "store" } },
              { apiName: "provider", label: "Provider", fieldType: "text", sourceColumn: "provider", required: true, writable: true },
              { apiName: "name", label: "Name", fieldType: "text", sourceColumn: "name", required: true, writable: true },
              { apiName: "terminal_identifier", label: "Terminal Identifier", fieldType: "text", sourceColumn: "terminal_identifier", writable: true },
              { apiName: "connection_url", label: "Connection URL", fieldType: "text", sourceColumn: "connection_url", writable: true },
              { apiName: "api_credentials", label: "API Credentials", fieldType: "text", sourceColumn: "api_credentials", readable: false, writable: true, config: { writeOnly: true, secret: true } },
              { apiName: "active", label: "Active", fieldType: "boolean", sourceColumn: "active", writable: true },
              { apiName: "last_test_result", label: "Last Test Result", fieldType: "text", sourceColumn: "last_test_result", writable: false },
              { apiName: "last_tested_at", label: "Last Tested", fieldType: "datetime", sourceColumn: "last_tested_at", writable: false }
            ],
          },
          {
            objectKey: "hardware_configuration",
            label: "Hardware Configuration",
            pluralLabel: "Hardware",
            description: "Store-scoped barcode scanner, cash drawer and receipt-printer configuration.",
            sourceTable: "hardware_configurations",
            storeScoped: true,
            config: { settingsHost: true, settingsGroup: "Hardware", settingsLabel: "Hardware", settingsOrder: 80, settingsAllowDelete: true },
            metadataScope: "global",
            fieldsMetadataScope: "global",
            fields: [
              { apiName: "company_id", label: "Company", fieldType: "lookup", sourceColumn: "company_id", writable: false },
              { apiName: "store_id", label: "Store", fieldType: "lookup", sourceColumn: "store_id", writable: false, config: { relatedObjectKey: "store" } },
              { apiName: "device_type", label: "Device Type", fieldType: "select", sourceColumn: "device_type", required: true, writable: true, options: ["BARCODE_SCANNER","CASH_DRAWER","RECEIPT_PRINTER"] },
              { apiName: "device_name", label: "Device Name", fieldType: "text", sourceColumn: "device_name", writable: true },
              { apiName: "connection_type", label: "Connection Type", fieldType: "text", sourceColumn: "connection_type", writable: true },
              { apiName: "connection_address", label: "Connection Address", fieldType: "text", sourceColumn: "connection_address", writable: true },
              { apiName: "paper_width", label: "Paper Width", fieldType: "text", sourceColumn: "paper_width", writable: true },
              { apiName: "is_default", label: "Default", fieldType: "boolean", sourceColumn: "is_default", writable: true },
              { apiName: "active", label: "Active", fieldType: "boolean", sourceColumn: "active", writable: true },
              { apiName: "last_test_result", label: "Last Test Result", fieldType: "text", sourceColumn: "last_test_result", writable: false },
              { apiName: "last_tested_at", label: "Last Tested", fieldType: "datetime", sourceColumn: "last_tested_at", writable: false }
            ],
          },
          {
            objectKey: "integration",
            label: "Integration",
            pluralLabel: "Connections",
            description: "Company integration connection state. Provider secrets remain protected by provider-specific domain actions.",
            sourceTable: "integrations",
            config: { settingsHost: true, settingsGroup: "Integrations", settingsLabel: "Connections", settingsOrder: 100, settingsAllowCreate: false, settingsAllowDelete: false },
            metadataScope: "global",
            fieldsMetadataScope: "global",
            fields: [
              { apiName: "company_id", label: "Company", fieldType: "lookup", sourceColumn: "company_id", writable: false },
              { apiName: "provider", label: "Provider", fieldType: "text", sourceColumn: "provider", readable: true, writable: false },
              { apiName: "enabled", label: "Enabled", fieldType: "boolean", sourceColumn: "active", writable: true },
              { apiName: "created_at", label: "Created", fieldType: "datetime", sourceColumn: "created_at", writable: false },
              { apiName: "updated_at", label: "Updated", fieldType: "datetime", sourceColumn: "updated_at", writable: false }
            ],
          },
          {
            objectKey: "message_template",
            label: "Message Template",
            pluralLabel: "Message Templates",
            description: "Metadata-driven email, SMS and WhatsApp templates.",
            sourceTable: "platform_message_templates",
            config: { settingsHost: true, settingsGroup: "Platform", settingsLabel: "Message Templates", settingsOrder: 310, settingsAllowDelete: true },
            metadataScope: "global",
            fieldsMetadataScope: "global",
            fields: [
              { apiName: "company_id", label: "Company", fieldType: "lookup", sourceColumn: "company_id", writable: false },
              { apiName: "name", label: "Name", fieldType: "text", sourceColumn: "name", required: true, writable: true },
              { apiName: "api_key", label: "API Key", fieldType: "text", sourceColumn: "api_key", writable: false },
              { apiName: "description", label: "Description", fieldType: "text", sourceColumn: "description", writable: true },
              { apiName: "channel", label: "Channel", fieldType: "select", sourceColumn: "channel", required: true, writable: true, options: ["EMAIL","SMS","WHATSAPP"] },
              { apiName: "object_id", label: "Object", fieldType: "lookup", sourceColumn: "object_id", writable: true },
              { apiName: "subject", label: "Subject", fieldType: "text", sourceColumn: "subject", writable: true },
              { apiName: "body", label: "Body", fieldType: "text", sourceColumn: "body", required: true, writable: true, config: { multiline: true } },
              { apiName: "active", label: "Active", fieldType: "boolean", sourceColumn: "active", writable: true },
              { apiName: "total_invoiced", label: "Total Invoiced", fieldType: "rollup", writable: false, config: { operation: "SUM", relationshipKey: "invoices", field: "total", resultType: "currency" } },
              { apiName: "total_paid", label: "Total Paid", fieldType: "rollup", writable: false, config: { operation: "SUM", relationshipKey: "payments", field: "amount", condition: { match: "all", conditions: [{ field: "status", operator: "equals", value: "COMPLETED" }] }, resultType: "currency" } },
              { apiName: "total_credits", label: "Credits", fieldType: "rollup", writable: false, config: { operation: "SUM", relationshipKey: "ledger_entries", field: "amount", condition: { match: "all", conditions: [{ field: "debit", operator: "equals", value: false }] }, resultType: "currency" } },
              { apiName: "total_debits", label: "Debits", fieldType: "rollup", writable: false, config: { operation: "SUM", relationshipKey: "ledger_entries", field: "amount", condition: { match: "all", conditions: [{ field: "debit", operator: "equals", value: true }] }, resultType: "currency" } },
              { apiName: "outstanding_balance", label: "Outstanding", fieldType: "formula", writable: false, config: { expression: "MAX(total_invoiced - total_paid, 0)", resultType: "currency" } },
              { apiName: "account_balance", label: "Account Balance", fieldType: "formula", writable: false, config: { expression: "total_debits - total_credits", resultType: "currency" } },
              { apiName: "created_at", label: "Created", fieldType: "datetime", sourceColumn: "created_at", writable: false },
              { apiName: "updated_at", label: "Updated", fieldType: "datetime", sourceColumn: "updated_at", writable: false }
            ],
          },        ],
        relationships: [
          { parentObjectKey: "role", childObjectKey: "role_permission", relationshipKey: "permissions", relationshipType: "one_to_many", childFieldApiName: "role_id" },
          { parentObjectKey: "permission", childObjectKey: "role_permission", relationshipKey: "roles", relationshipType: "one_to_many", childFieldApiName: "permission_id" },
          { parentObjectKey: "role", childObjectKey: "role", relationshipKey: "child_roles", relationshipType: "one_to_many", childFieldApiName: "parent_role_id" }
        ],
        listViews: [
          { objectKey: "system_settings", viewKey: "company_settings", label: "System Settings", columns: ["date_format","vat_enabled","default_vat_rate","product_view","updated_at"], isDefault: true },
          { objectKey: "role", viewKey: "all_roles", label: "Roles", columns: ["name","description","parent_role_id","is_system_role"], isDefault: true },
          { objectKey: "permission", viewKey: "all_permissions", label: "Permissions", columns: ["code","name","description"], isDefault: true },
          { objectKey: "role_permission", viewKey: "role_permissions", label: "Role Permissions", columns: ["role_id","permission_id"], isDefault: true }
        ],
      } : {}),
      ...(entry.key === "staff" ? {
        packageKey: "staff",
        packageType: "FOUNDATION",
        name: "Staff Core",
        version: entry.version || "1.1.0",
        description: "Technical foundation for Staff and Attendance metadata on existing tenant-scoped records.",
        dependencies: [],
        billable: false,
        licenceRequired: false,
        visibility: "HIDDEN",
        installable: true,
        systemOnly: true,
        technical: true,
        upgrade: {
          strategy: "idempotent_metadata_upsert",
          adoptsExistingData: true,
          preservesRecordIds: true,
          migrations: ["staff_core_object_metadata_v1"],
        },
        objects: [
          {
            objectKey: "employee",
            label: "Staff Member",
            pluralLabel: "Staff",
            description: "Business-facing staff metadata on the existing authentication user record.",
            sourceTable: "users",
            config: { settingsHost: true, settingsGroup: "Users", settingsLabel: "Users", settingsOrder: 200, settingsAllowCreate: false, settingsAllowDelete: false },
            metadataScope: "global",
            fieldsMetadataScope: "global",
            fields: [
              { apiName: "full_name", label: "Name", fieldType: "text", sourceColumn: "full_name", required: true, writable: true },
              { apiName: "username", label: "User", fieldType: "text", sourceColumn: "username", required: true, writable: false },
              { apiName: "email", label: "Email", fieldType: "email", sourceColumn: "email", writable: true },
              { apiName: "active", label: "Status", fieldType: "boolean", sourceColumn: "active", required: true, writable: true },
              { apiName: "store_id", label: "Store", fieldType: "lookup", sourceColumn: "store_id", writable: true, config: { relatedObjectKey: "store" } },
              { apiName: "role_id", label: "Role", fieldType: "lookup", sourceColumn: "role_id", writable: true, config: { relatedObjectKey: "role" } },
                            { apiName: "created_at", label: "Created", fieldType: "datetime", sourceColumn: "created_at", writable: false },
              { apiName: "updated_at", label: "Updated", fieldType: "datetime", sourceColumn: "updated_at", writable: false },
            ],
          },
          {
            objectKey: "attendance",
            label: "Attendance",
            pluralLabel: "Attendance Records",
            description: "Existing server-timestamped staff attendance sessions.",
            sourceTable: "attendance_records",
            metadataScope: "global",
            fieldsMetadataScope: "global",
            storeScoped: true,
            fields: [
              { apiName: "user_id", label: "Staff User", fieldType: "lookup", sourceColumn: "user_id", required: true, writable: true },
              { apiName: "store_id", label: "Store", fieldType: "lookup", sourceColumn: "store_id", required: true, writable: false },
              { apiName: "status", label: "Status", fieldType: "picklist", sourceColumn: "status", required: true, writable: true, options: ["open", "closed"] },
              { apiName: "clock_in", label: "Clock In", fieldType: "datetime", sourceColumn: "clock_in", required: true, writable: true },
              { apiName: "clock_out", label: "Clock Out", fieldType: "datetime", sourceColumn: "clock_out", writable: true },
              { apiName: "worked_minutes", label: "Worked Minutes", fieldType: "number", sourceColumn: "worked_minutes", writable: true },
              { apiName: "created_at", label: "Created", fieldType: "datetime", sourceColumn: "created_at", writable: false },
            ],
          },
        ],
        relationships: [
          { parentObjectKey: "employee", childObjectKey: "attendance", relationshipKey: "attendance_records", relationshipType: "one_to_many", childFieldApiName: "user_id", required: true },
          { parentObjectKey: "store", childObjectKey: "employee", relationshipKey: "staff", relationshipType: "one_to_many", childFieldApiName: "store_id" },
        ],
        listViews: [
          {
            objectKey: "employee",
            viewKey: "all_staff",
            label: "All Staff",
            description: "Existing business-facing user and employee records.",
            columns: ["full_name", "active", "username", "email", "store_id"],
            sort: { field: "full_name", direction: "asc" },
            isDefault: true,
          },
        ],
        layouts: [
          {
            objectKey: "employee",
            pageType: "detail",
            layoutKey: "staff_record_detail",
            name: "Staff Record",
            metadataScope: "global",
            definition: {
              sections: [{ id: "staff-details", label: "Staff Details", order: 0, columns: 2, visible: true }],
              components: [
                { id: "staff-header", type: "header", label: "Staff Record", section_id: "staff-details", order: 0, width: "full", visible: true },
                { id: "staff-full-name", type: "field", field_key: "full_name", section_id: "staff-details", order: 1, width: "1/2", visible: true, readOnly: true },
                { id: "staff-active", type: "field", field_key: "active", section_id: "staff-details", order: 2, width: "1/2", visible: true, readOnly: true },
                { id: "staff-username", type: "field", field_key: "username", section_id: "staff-details", order: 3, width: "1/2", visible: true, readOnly: true },
                { id: "staff-email", type: "field", field_key: "email", section_id: "staff-details", order: 4, width: "1/2", visible: true, readOnly: true },
                { id: "staff-store", type: "field", field_key: "store_id", section_id: "staff-details", order: 5, width: "1/2", visible: true, readOnly: true },
                { id: "staff-created", type: "field", field_key: "created_at", section_id: "staff-details", order: 6, width: "1/2", visible: true, readOnly: true },
                { id: "staff-attendance", type: "related_list", relationship_key: "attendance_records", label: "Attendance", section_id: "staff-details", order: 7, width: "full", visible: true },
              ],
            },
          },
          {
            objectKey: "employee",
            pageType: "view",
            layoutKey: "staff_record_view",
            name: "Staff Record View",
            metadataScope: "global",
            definition: {
              sections: [{ id: "staff-view", label: "Staff Details", order: 0, columns: 2, visible: true }],
              components: [
                { id: "staff-view-header", type: "header", label: "Staff Record", section_id: "staff-view", order: 0, width: "full", visible: true },
                { id: "staff-view-name", type: "field", field_key: "full_name", section_id: "staff-view", order: 1, width: "1/2", visible: true, readOnly: true },
                { id: "staff-view-status", type: "field", field_key: "active", section_id: "staff-view", order: 2, width: "1/2", visible: true, readOnly: true },
                { id: "staff-view-user", type: "field", field_key: "username", section_id: "staff-view", order: 3, width: "1/2", visible: true, readOnly: true },
                { id: "staff-view-email", type: "field", field_key: "email", section_id: "staff-view", order: 4, width: "1/2", visible: true, readOnly: true },
                { id: "staff-view-store", type: "field", field_key: "store_id", section_id: "staff-view", order: 5, width: "1/2", visible: true, readOnly: true },
                { id: "staff-view-attendance", type: "related_list", relationship_key: "attendance_records", label: "Attendance", section_id: "staff-view", order: 6, width: "full", visible: true },
              ],
            },
          },
        ],
        workflows: [
          {
            objectKey: "employee",
            name: "Staff - Set Active Status",
            apiName: "STAFF_SET_ACTIVE_STATUS",
            triggerKey: "manual",
            active: true,
            lifecycleStatus: "ACTIVE",
            inputContract: [{ name:"active",label:"Active",type:"boolean",required:true }],
            actions: [
              { id:"set_active_status",label:"Set Active Status",apiName:"set_active_status",key:"UPDATE_RECORD",objectKey:"employee",recordId:{path:"$record.id"},fieldValues:{active:{path:"$record.active"}} },
            ],
          },
          {
            objectKey: "employee",
            name: "Staff - Send Password Reset",
            apiName: "STAFF_SEND_PASSWORD_RESET",
            triggerKey: "manual",
            active: true,
            lifecycleStatus: "ACTIVE",
            actions: [
              { id:"get_reset_settings",label:"Get User Lifecycle Settings",apiName:"get_reset_settings",key:"GET_RECORDS",objectKey:"system_settings",limit:1,store:"first" },
              { id:"reset_user_active",label:"User Is Active",apiName:"reset_user_active",key:"CONDITION",
                outcomes:[{id:"yes",label:"Active",condition:{match:"all",conditions:[{field:"$record.active",operator:"equals",value:true}]},branch:["reset_enabled"]}],
                defaultLabel:"Inactive",defaultBranch:["reset_inactive_error"] },
              { id:"reset_inactive_error",label:"Inactive User",apiName:"reset_inactive_error",key:"CUSTOM_ERROR",errorMessage:"Password reset cannot be sent to an inactive user",errorLocation:"record" },
              { id:"reset_enabled",label:"Password Reset Email Enabled",apiName:"reset_enabled",key:"CONDITION",
                outcomes:[{id:"yes",label:"Enabled",condition:{match:"all",conditions:[{field:"steps.get_reset_settings.record.password_reset_email_enabled",operator:"equals",value:true}]},branch:["reset_email_present"]}],
                defaultLabel:"Disabled",defaultBranch:["reset_disabled_error"] },
              { id:"reset_disabled_error",label:"Password Reset Disabled",apiName:"reset_disabled_error",key:"CUSTOM_ERROR",errorMessage:"Password reset email is disabled in Settings",errorLocation:"record" },
              { id:"reset_email_present",label:"User Has Email",apiName:"reset_email_present",key:"CONDITION",
                outcomes:[{id:"yes",label:"Email Present",condition:{match:"all",conditions:[{field:"$record.email",operator:"is_not_empty"}]},branch:["issue_reset_token","send_reset_email"]}],
                defaultLabel:"Missing Email",defaultBranch:["reset_email_error"] },
              { id:"reset_email_error",label:"Missing Email",apiName:"reset_email_error",key:"CUSTOM_ERROR",errorMessage:"User has no email address",errorLocation:"record" },
              { id:"issue_reset_token",label:"Issue Password Reset Token",apiName:"issue_reset_token",key:"CALL_FUNCTION",functionKey:"account.lifecycle.token.issue",
                inputs:{userId:{path:"$record.id"},purpose:"PASSWORD_RESET",expiresMinutes:{path:"steps.get_reset_settings.record.password_reset_expiry_minutes"}} },
              { id:"send_reset_email",label:"Send Password Reset Email",apiName:"send_reset_email",key:"SEND_COMMUNICATION",channel:"EMAIL",recipient:{path:"$record.email"},templateKey:"PASSWORD_RESET",
                templateContext:{token:{path:"steps.issue_reset_token.token"},userId:{path:"$record.id"},expiresMinutes:{path:"steps.issue_reset_token.expiresMinutes"}} },
            ],
          },
          {
            objectKey: "employee",
            name: "Staff - Send Invitation",
            apiName: "STAFF_SEND_INVITATION",
            triggerKey: "manual",
            active: true,
            lifecycleStatus: "ACTIVE",
            actions: [
              { id:"get_invite_settings",label:"Get User Lifecycle Settings",apiName:"get_invite_settings",key:"GET_RECORDS",objectKey:"system_settings",limit:1,store:"first" },
              { id:"invite_enabled",label:"Email Registration Enabled",apiName:"invite_enabled",key:"CONDITION",
                outcomes:[{id:"yes",label:"Enabled",condition:{match:"all",conditions:[{field:"steps.get_invite_settings.record.email_registration_enabled",operator:"equals",value:true}]},branch:["invite_email_present"]}],
                defaultLabel:"Disabled",defaultBranch:["invite_disabled_error"] },
              { id:"invite_disabled_error",label:"Email Registration Disabled",apiName:"invite_disabled_error",key:"CUSTOM_ERROR",errorMessage:"Email registration is disabled in Settings",errorLocation:"record" },
              { id:"invite_email_present",label:"User Has Email",apiName:"invite_email_present",key:"CONDITION",
                outcomes:[{id:"yes",label:"Email Present",condition:{match:"all",conditions:[{field:"$record.email",operator:"is_not_empty"}]},branch:["issue_invite_token","send_invite_email"]}],
                defaultLabel:"Missing Email",defaultBranch:["invite_email_error"] },
              { id:"invite_email_error",label:"Missing Email",apiName:"invite_email_error",key:"CUSTOM_ERROR",errorMessage:"User has no email address",errorLocation:"record" },
              { id:"issue_invite_token",label:"Issue Registration Token",apiName:"issue_invite_token",key:"CALL_FUNCTION",functionKey:"account.lifecycle.token.issue",
                inputs:{userId:{path:"$record.id"},purpose:"REGISTRATION",expiresMinutes:{path:"steps.get_invite_settings.record.registration_link_expiry_minutes"}} },
              { id:"send_invite_email",label:"Send Invitation Email",apiName:"send_invite_email",key:"SEND_COMMUNICATION",channel:"EMAIL",recipient:{path:"$record.email"},templateKey:"USER_INVITATION",
                templateContext:{token:{path:"steps.issue_invite_token.token"},userId:{path:"$record.id"},expiresMinutes:{path:"steps.issue_invite_token.expiresMinutes"}} },
            ],
          },
        ],
        actions: [
          { actionKey:"employee.set_active_status",objectKey:"employee",label:"Set Active Status",handlerKey:"RUN_SUBFLOW",requiredPermission:"user.edit",config:{subflowApiName:"STAFF_SET_ACTIVE_STATUS"} },
          { actionKey:"employee.send_password_reset",objectKey:"employee",label:"Send Password Reset",handlerKey:"RUN_SUBFLOW",requiredPermission:"user.manage",config:{subflowApiName:"STAFF_SEND_PASSWORD_RESET"} },
          { actionKey:"employee.send_invitation",objectKey:"employee",label:"Send Invitation",handlerKey:"RUN_SUBFLOW",requiredPermission:"user.manage",config:{subflowApiName:"STAFF_SEND_INVITATION"} },
        ],
        buttons: [
          { objectKey:"employee",buttonKey:"set_active_status",label:"Set Active Status",targetType:"action",targetKey:"employee.set_active_status",actionKey:"employee.set_active_status",placement:"record",variant:"secondary",requiredPermission:"user.edit",inputMappings:{active:{path:"context.active"}},config:{hidden:true} },
          { objectKey:"employee",buttonKey:"send_password_reset",label:"Send Password Reset",targetType:"action",targetKey:"employee.send_password_reset",actionKey:"employee.send_password_reset",placement:"record",variant:"secondary",requiredPermission:"user.manage",config:{icon:"key-round"} },
          { objectKey:"employee",buttonKey:"send_invitation",label:"Send Invitation",targetType:"action",targetKey:"employee.send_invitation",actionKey:"employee.send_invitation",placement:"record",variant:"secondary",requiredPermission:"user.manage",config:{icon:"mail-plus"} },
        ],
        rules: [
          {
            name: "Staff name is required",
            objectKey: "employee",
            triggerKey: "before_save",
            active: true,
            required: true,
            conditions: [{ field: "full_name", operator: "is_empty" }],
            action: { type: "validation", match: "all", message: "Enter a staff name." },
          },
        ],
        permissionDeclarations: [
          { key: "staff_records", objectKey: "employee", permission: "user.view", access: "read" },
          { key: "staff_manage", objectKey: "employee", permission: "user.edit", access: "manage" },
          { key: "attendance_records", objectKey: "attendance", permission: "attendance.view", access: "read" },
          { key: "attendance_actions", objectKey: "attendance", permission: "attendance.use", access: "execute" },
        ],
        permissions: ["user.view", "user.create", "user.edit", "attendance.view", "attendance.use"],
        capabilities: ["staff_core", "employee_metadata", "attendance_metadata"],
        ownership: {
          metadataTypes: ["object", "field", "relationship", "layout", "list_view", "validation", "workflow", "action"],
          excludes: ["authentication_user_metadata", "roles", "permissions", "user_records", "attendance_record_data"],
        },
        upgradeMetadata: { strategy: "additive", preserveExistingUserIds: true, preserveAttendanceRecords: true },
        migrations: ["staff_core_object_metadata_v1"],
      } : {}),
      ...(entry.key === "supplier_core" ? {
        objects: [
          {
            objectKey: "supplier",
            label: "Supplier",
            pluralLabel: "Suppliers",
            description: "Canonical supplier identity and contact details.",
            sourceTable: "suppliers",
            metadataScope: "global",
            adoptFromPackageKeys: ["retail_pos"],
            fields: [
              { apiName: "company_id", label: "Company", fieldType: "lookup", sourceColumn: "company_id", required: true, writable: false },
              { apiName: "name", label: "Name", fieldType: "text", sourceColumn: "name", required: true, writable: true },
              { apiName: "contact_name", label: "Contact Name", fieldType: "text", sourceColumn: "contact_name", writable: true },
              { apiName: "phone", label: "Phone", fieldType: "phone", sourceColumn: "phone", writable: true },
              { apiName: "email", label: "Email", fieldType: "email", sourceColumn: "email", writable: true },
              { apiName: "address", label: "Address", fieldType: "text", sourceColumn: "address", writable: true },
              { apiName: "notes", label: "Notes", fieldType: "text", sourceColumn: "notes", writable: true },
              { apiName: "active", label: "Active", fieldType: "boolean", sourceColumn: "active", writable: true },
              { apiName: "created_at", label: "Created", fieldType: "datetime", sourceColumn: "created_at", writable: false },
              { apiName: "updated_at", label: "Updated", fieldType: "datetime", sourceColumn: "updated_at", writable: false },
            ],
          },
          {
            objectKey: "supplier_product",
            label: "Supplier Product",
            pluralLabel: "Supplier Products",
            description: "Supplier-specific product references, costs and effective dates.",
            sourceTable: "supplier_products",
            metadataScope: "global",
            adoptFromPackageKeys: ["retail_pos"],
            fields: [
              { apiName: "company_id", label: "Company", fieldType: "lookup", sourceColumn: "company_id", required: true, writable: false },
              { apiName: "supplier_id", label: "Supplier", fieldType: "lookup", sourceColumn: "supplier_id", required: true, writable: true, config: { relationshipKey: "supplier", relatedObjectKey: "supplier" } },
              { apiName: "product_id", label: "Product", fieldType: "lookup", sourceColumn: "product_id", required: true, writable: true, config: { relationshipKey: "product", relatedObjectKey: "product" } },
              { apiName: "supplier_sku", label: "Supplier SKU", fieldType: "text", sourceColumn: "supplier_sku", writable: true },
              { apiName: "supplier_description", label: "Supplier Description", fieldType: "text", sourceColumn: "supplier_description", writable: true },
              { apiName: "cost_price", label: "Supplier Cost", fieldType: "currency", sourceColumn: "cost_price", required: true, writable: true },
              { apiName: "effective_from", label: "Effective From", fieldType: "date", sourceColumn: "effective_from", required: true, writable: true },
              { apiName: "effective_to", label: "Effective To", fieldType: "date", sourceColumn: "effective_to", writable: true },
              { apiName: "preferred", label: "Preferred Supplier", fieldType: "boolean", sourceColumn: "preferred", writable: true },
              { apiName: "active", label: "Active", fieldType: "boolean", sourceColumn: "active", writable: true },
              { apiName: "created_at", label: "Created", fieldType: "datetime", sourceColumn: "created_at", writable: false },
              { apiName: "updated_at", label: "Updated", fieldType: "datetime", sourceColumn: "updated_at", writable: false },
            ],
          },
        ],
        relationships: [
          { parentObjectKey: "supplier", childObjectKey: "supplier_product", relationshipKey: "products", relationshipType: "one_to_many", childFieldApiName: "supplier_id" },
          { parentObjectKey: "product", childObjectKey: "supplier_product", relationshipKey: "supplier_products", relationshipType: "one_to_many", childFieldApiName: "product_id" },
          { parentObjectKey: "supplier_product", childObjectKey: "supplier", relationshipKey: "supplier", relationshipType: "lookup", parentFieldApiName: "supplier_id" },
          { parentObjectKey: "supplier_product", childObjectKey: "product", relationshipKey: "product", relationshipType: "lookup", parentFieldApiName: "product_id" },
          { parentObjectKey: "supplier", childObjectKey: "purchase", relationshipKey: "purchases", relationshipType: "one_to_many", childFieldApiName: "supplier_id" },
        ],
        listViews: [
          { objectKey: "supplier", viewKey: "all", label: "All Suppliers", columns: ["name", "contact_name", "phone", "email", "outstanding_balance", "account_balance", "active", "updated_at"], isDefault: true },
          { objectKey: "supplier_product", viewKey: "sourcing", label: "Supplier Product Sourcing", columns: ["supplier_id", "product_id", "supplier_sku", "cost_price", "effective_from", "effective_to", "preferred", "active"], isDefault: true },
        ],
        permissionDeclarations: [
          { permission: "inventory.view", label: "View supplier master data" },
          { permission: "inventory.adjust", label: "Manage supplier master data" },
          { permission: "purchase.view", label: "View supplier references used in purchasing" },
        ],
        lifecycle: {
          preservesExistingRecords: true,
          preservesCustomFields: true,
          disableBehavior: "deactivate-package-access-only",
        },
      } : {}),
      ...(entry.key === "purchasing_core" ? {
        objects: [
          {
            objectKey: "purchase", label: "Purchase", pluralLabel: "Purchases",
            description: "Protected supplier purchase header.", sourceTable: "purchases",
            metadataScope: "global", storeScoped: true, required: true,
            adoptFromPackageKeys: ["retail_pos"], config: { flowWritesOnly: true, trackHistory: true },
            fields: [
              { apiName:"company_id",label:"Company",fieldType:"lookup",sourceColumn:"company_id",writable:false },
              { apiName:"store_id",label:"Store",fieldType:"lookup",sourceColumn:"store_id",writable:true },
              { apiName:"supplier_id",label:"Supplier",fieldType:"lookup",sourceColumn:"supplier_id",writable:true,config:{relatedObjectKey:"supplier"} },
              { apiName:"supplier_name",label:"Supplier Name",fieldType:"text",sourceColumn:"supplier_name",writable:true },
              { apiName:"reference_number",label:"Reference",fieldType:"text",sourceColumn:"reference_number",writable:true },
              { apiName:"purchase_date",label:"Purchase Date",fieldType:"date",sourceColumn:"purchase_date",writable:true },
              { apiName:"notes",label:"Notes",fieldType:"text",sourceColumn:"notes",writable:true },
              { apiName:"status",label:"Status",fieldType:"text",sourceColumn:"status",writable:true },
              { apiName:"subtotal",label:"Subtotal",fieldType:"currency",sourceColumn:"subtotal",writable:true },
              { apiName:"total",label:"Total",fieldType:"currency",sourceColumn:"total",writable:true },
              { apiName:"created_by",label:"Created By",fieldType:"lookup",sourceColumn:"created_by",writable:true },
              { apiName:"received_by",label:"Received By",fieldType:"lookup",sourceColumn:"received_by",writable:true },
              { apiName:"received_at",label:"Received At",fieldType:"datetime",sourceColumn:"received_at",writable:true },
              { apiName:"created_at",label:"Created",fieldType:"datetime",sourceColumn:"created_at",writable:false },
              { apiName:"updated_at",label:"Updated",fieldType:"datetime",sourceColumn:"updated_at",writable:false },
            ],
          },
          {
            objectKey: "purchase_line", label: "Purchase Line", pluralLabel: "Purchase Lines",
            description: "Protected purchase product lines.", sourceTable: "purchase_items",
            metadataScope: "global", required: true, adoptFromPackageKeys: ["retail_pos"],
            config: { flowWritesOnly: true },
            fields: [
              { apiName:"purchase_id",label:"Purchase",fieldType:"lookup",sourceColumn:"purchase_id",writable:true },
              { apiName:"product_id",label:"Product",fieldType:"lookup",sourceColumn:"product_id",writable:true,config:{relatedObjectKey:"product"} },
              { apiName:"quantity",label:"Ordered",fieldType:"decimal",sourceColumn:"quantity",writable:true },
              { apiName:"received_quantity",label:"Received",fieldType:"decimal",sourceColumn:"received_quantity",writable:true },
              { apiName:"unit_cost",label:"Unit Cost",fieldType:"currency",sourceColumn:"unit_cost",writable:true },
              { apiName:"line_total",label:"Line Total",fieldType:"currency",sourceColumn:"line_total",writable:true },
              { apiName:"batch_number",label:"Batch Number",fieldType:"text",sourceColumn:"batch_number",writable:true },
              { apiName:"manufacturing_date",label:"Manufacturing Date",fieldType:"date",sourceColumn:"manufacturing_date",writable:true },
              { apiName:"expiry_date",label:"Expiry Date",fieldType:"date",sourceColumn:"expiry_date",writable:true },
              { apiName:"returned_quantity",label:"Returned",fieldType:"rollup",writable:false,config:{operation:"SUM",relationshipKey:"return_lines",field:"quantity",resultType:"decimal"} },
              { apiName:"remaining_returnable",label:"Remaining Returnable",fieldType:"formula",writable:false,config:{expression:"MAX(received_quantity - returned_quantity, 0)",resultType:"decimal"} },
            ],
          },
          {
            objectKey:"purchase_receipt",label:"Purchase Receipt",pluralLabel:"Purchase Receipts",
            sourceTable:"purchase_receipts",metadataScope:"global",storeScoped:true,required:true,
            adoptFromPackageKeys:["retail_pos"],config:{flowWritesOnly:true},
            fields:[
              {apiName:"company_id",label:"Company",fieldType:"lookup",sourceColumn:"company_id",writable:false},
              {apiName:"purchase_id",label:"Purchase",fieldType:"lookup",sourceColumn:"purchase_id",writable:true},
              {apiName:"store_id",label:"Store",fieldType:"lookup",sourceColumn:"store_id",writable:true},
              {apiName:"reference_number",label:"Reference",fieldType:"text",sourceColumn:"reference_number",writable:true},
              {apiName:"notes",label:"Notes",fieldType:"text",sourceColumn:"notes",writable:true},
              {apiName:"received_by",label:"Received By",fieldType:"lookup",sourceColumn:"received_by",writable:true},
              {apiName:"received_at",label:"Received",fieldType:"datetime",sourceColumn:"received_at",writable:true},
            ],
          },
          {
            objectKey:"stock_return",label:"Stock Return",pluralLabel:"Stock Returns",sourceTable:"stock_returns",metadataScope:"global",storeScoped:true,required:true,config:{flowWritesOnly:true},
            fields:[
              {apiName:"store_id",label:"Store",fieldType:"lookup",sourceColumn:"store_id",writable:true},
              {apiName:"return_type",label:"Return Type",fieldType:"picklist",sourceColumn:"return_type",writable:true,options:["CUSTOMER","SUPPLIER"]},
              {apiName:"return_number",label:"Return Number",fieldType:"text",sourceColumn:"return_number",writable:true},
              {apiName:"sale_id",label:"Sale",fieldType:"lookup",sourceColumn:"sale_id",writable:true},
              {apiName:"purchase_id",label:"Purchase",fieldType:"lookup",sourceColumn:"purchase_id",writable:true},
              {apiName:"supplier_id",label:"Supplier",fieldType:"lookup",sourceColumn:"supplier_id",writable:true},
              {apiName:"request_key",label:"Request Key",fieldType:"text",sourceColumn:"request_key",writable:true},
              {apiName:"status",label:"Status",fieldType:"picklist",sourceColumn:"status",writable:true,options:["COMPLETED","CANCELLED"]},
              {apiName:"refund_amount",label:"Refund Amount",fieldType:"currency",sourceColumn:"refund_amount",writable:true},
              {apiName:"refund_method",label:"Refund Method",fieldType:"text",sourceColumn:"refund_method",writable:true},
              {apiName:"reason",label:"Reason",fieldType:"text",sourceColumn:"reason",writable:true},
              {apiName:"created_by",label:"Created By",fieldType:"lookup",sourceColumn:"created_by",writable:true}
            ]
          },
          {
            objectKey:"stock_return_line",label:"Stock Return Line",pluralLabel:"Stock Return Lines",sourceTable:"stock_return_items",metadataScope:"global",required:true,config:{flowWritesOnly:true},
            fields:[
              {apiName:"return_id",label:"Return",fieldType:"lookup",sourceColumn:"return_id",writable:true},
              {apiName:"product_id",label:"Product",fieldType:"lookup",sourceColumn:"product_id",writable:true},
              {apiName:"sale_item_id",label:"Sale Item",fieldType:"lookup",sourceColumn:"sale_item_id",writable:true},
              {apiName:"purchase_item_id",label:"Purchase Line",fieldType:"lookup",sourceColumn:"purchase_item_id",writable:true},
              {apiName:"quantity",label:"Quantity",fieldType:"decimal",sourceColumn:"quantity",writable:true},
              {apiName:"reason",label:"Reason",fieldType:"text",sourceColumn:"reason",writable:true}
            ]
          },
        ],
        relationships: [
          {parentObjectKey:"supplier",childObjectKey:"purchase",relationshipKey:"purchases",relationshipType:"one_to_many",childFieldApiName:"supplier_id"},
          {parentObjectKey:"purchase",childObjectKey:"purchase_line",relationshipKey:"lines",relationshipType:"one_to_many",childFieldApiName:"purchase_id",required:true},
          {parentObjectKey:"purchase_line",childObjectKey:"product",relationshipKey:"product",relationshipType:"lookup",parentFieldApiName:"product_id"},
          {parentObjectKey:"purchase",childObjectKey:"purchase_receipt",relationshipKey:"receipts",relationshipType:"one_to_many",childFieldApiName:"purchase_id"},
          {parentObjectKey:"purchase_line",childObjectKey:"stock_return_line",relationshipKey:"return_lines",relationshipType:"one_to_many",childFieldApiName:"purchase_item_id"},
          {parentObjectKey:"stock_return",childObjectKey:"stock_return_line",relationshipKey:"lines",relationshipType:"one_to_many",childFieldApiName:"return_id",required:true},
        ],
        listViews: [
          {objectKey:"purchase",viewKey:"all",label:"Purchases",columns:["reference_number","supplier_name","purchase_date","status","total","created_at"],sort:{field:"purchase_date",direction:"desc"},isDefault:true},
          {objectKey:"purchase_line",viewKey:"returnable",label:"Supplier Returns",columns:["purchase_id","product_id","quantity","received_quantity","returned_quantity","remaining_returnable","unit_cost"],filterModel:{received_quantity:{operator:"greater_than",value:0}},isDefault:true},
          {objectKey:"purchase_receipt",viewKey:"receipts",label:"Purchase Receipts",columns:["purchase_id","reference_number","received_at","received_by","notes"],sort:{field:"received_at",direction:"desc"},isDefault:true},
        ],
        workflows: [
          {objectKey:"purchase",name:"Purchase Create",triggerKey:"manual",active:true,lifecycleStatus:"ACTIVE",inputContract:[{name:"purchase",type:"record",required:true},{name:"items",type:"record_collection",required:true}],outputContract:[{name:"purchase",type:"record",source:"variables.purchase"}],actions:[
            {id:"create_purchase",label:"Create Purchase",key:"CREATE_RECORD",objectKey:"purchase",recordResource:{path:"variables.purchase"}},
            {id:"create_purchase_lines",label:"Create Purchase Lines",key:"CREATE_RECORD",objectKey:"purchase_line",recordCollectionResource:{path:"variables.items"},commonFieldValues:{purchase_id:{path:"variables.purchase.id"}}}
          ],variables:[{value:"variables.purchase",apiName:"purchase",label:"Purchase",type:"Variable",dataType:"Record",defaultValue:null,isCollection:false,availableInput:true,availableOutput:true,objectKey:"purchase"},{value:"variables.items",apiName:"items",label:"Purchase Lines",type:"Variable",dataType:"Record",defaultValue:[],isCollection:true,availableInput:true,availableOutput:false,objectKey:"purchase_line"}]},
          {objectKey:"purchase",name:"Purchase Receive",triggerKey:"manual",active:true,lifecycleStatus:"ACTIVE",inputContract:[{name:"receipt",type:"record",required:true},{name:"purchase",type:"record",required:true}],actions:[{id:"create_receipt",label:"Create Purchase Receipt",key:"CREATE_RECORD",objectKey:"purchase_receipt",recordResource:{path:"variables.receipt"}},{id:"update_purchase",label:"Update Purchase Receipt Status",key:"UPDATE_RECORD",objectKey:"purchase",recordId:{path:"record.id"},fieldValues:{status:{path:"variables.purchase.status"},received_by:{path:"variables.purchase.received_by"},received_at:{path:"variables.purchase.received_at"}}}],variables:[{value:"variables.receipt",apiName:"receipt",label:"Receipt",type:"Variable",dataType:"Record",defaultValue:null,isCollection:false,availableInput:true,availableOutput:true,objectKey:"purchase_receipt"},{value:"variables.purchase",apiName:"purchase",label:"Purchase Update",type:"Variable",dataType:"Record",defaultValue:null,isCollection:false,availableInput:true,availableOutput:false,objectKey:"purchase"}]},
          {objectKey:"purchase_line",name:"Supplier Return Execute",triggerKey:"manual",active:true,lifecycleStatus:"ACTIVE",inputContract:[{name:"return",type:"record",required:true},{name:"items",type:"record_collection",required:true}],actions:[{id:"create_return",label:"Create Supplier Return",key:"CREATE_RECORD",objectKey:"stock_return",recordResource:{path:"variables.return"}},{id:"create_return_lines",label:"Create Return Lines",key:"CREATE_RECORD",objectKey:"stock_return_line",recordCollectionResource:{path:"variables.items"},commonFieldValues:{return_id:{path:"variables.return.id"}}}],variables:[{value:"variables.return",apiName:"return",label:"Return",type:"Variable",dataType:"Record",defaultValue:null,isCollection:false,availableInput:true,availableOutput:true,objectKey:"stock_return"},{value:"variables.items",apiName:"items",label:"Return Lines",type:"Variable",dataType:"Record",defaultValue:[],isCollection:true,availableInput:true,availableOutput:false,objectKey:"stock_return_line"}]},
        ],
        buttons: [
          {objectKey:"purchase",buttonKey:"purchase_create",label:"New Purchase",targetType:"workflow",targetKey:"Purchase Create",placement:"list",variant:"primary",
            config:{order:10,requiredPermissionsAny:["purchase.create","inventory.adjust"],form:{submitLabel:"Create & Receive",includeMetadataFields:true,fields:[
              {name:"supplierId",label:"Supplier",type:"related_select",required:true,optionsSource:{objectKey:"supplier",valueField:"id",labelFields:["name"],filter:{field:"active",operator:"equals",value:true}}},
              {name:"supplierName",label:"Supplier name override",type:"text"},
              {name:"referenceNumber",label:"Reference / invoice number",type:"text"},
              {name:"purchaseDate",label:"Purchase date",type:"date",defaultValue:"today",required:true},
              {name:"notes",label:"Notes",type:"textarea"},
              {name:"items",label:"Product lines",type:"collection",minRows:1,defaultRows:1,fields:[
                {name:"productId",label:"Product",type:"related_select",required:true,optionsSource:{objectKey:"product",valueField:"id",labelFields:["name","sku"]}},
                {name:"quantity",label:"Quantity",type:"number",min:0.001,step:0.001,required:true,defaultValue:1},
                {name:"unitCost",label:"Unit cost",type:"number",min:0,step:0.01,required:true,defaultValue:0},
                {name:"batchNumber",label:"Batch",type:"text"},{name:"manufacturingDate",label:"MFG",type:"date"},{name:"expiryDate",label:"Expiry",type:"date"}
              ]},
              {name:"receiveNow",type:"hidden",defaultValue:true}
            ]}}},
          {objectKey:"purchase",buttonKey:"purchase_receive",label:"Receive Remaining",targetType:"workflow",targetKey:"Purchase Receive",placement:"record",variant:"primary",
            visibilityRule:{match:"all",conditions:[{field:"status",operator:"not_in",value:["RECEIVED","CANCELLED"]}]},
            config:{order:20,requiredPermissionsAny:["purchase.edit","inventory.adjust","purchases.receive"],form:{submitLabel:"Receive Remaining",fields:[
              {name:"receivingReference",label:"Receipt reference",type:"text"},{name:"receivingNotes",label:"Receipt notes",type:"textarea"}
            ]}}},
          {objectKey:"purchase_line",buttonKey:"supplier_return",label:"Return Stock",targetType:"workflow",targetKey:"Supplier Return Execute",placement:"record",variant:"secondary",
            visibilityRule:{match:"all",conditions:[{field:"remaining_returnable",operator:"greater_than",value:0}]},
            config:{order:30,requiredPermissionsAny:["returns.create","sale.refund"],form:{submitLabel:"Confirm Return",fields:[
              {name:"quantityToReturn",label:"Return quantity",type:"number",min:0.001,step:0.001,required:true},
              {name:"reason",label:"Reason",type:"textarea"},{name:"requestKey",type:"uuid"}
            ]}}},
        ],
        permissionDeclarations:[
          {permission:"purchase.view",label:"View purchases"},{permission:"purchase.create",label:"Create purchases"},
          {permission:"purchase.edit",label:"Receive purchases"},{permission:"returns.create",label:"Create supplier returns"}
        ],
      } : {}),
      ...(entry.key === "batch_expiry" ? {
        objects: [
          {
            objectKey: "inventory_batch", label: "Inventory Batch", pluralLabel: "Inventory Batches",
            description: "Store-level batch and expiry stock.", sourceTable: "inventory_batches",
            fields: [
              { apiName: "store_id", label: "Store", fieldType: "lookup", required: true, writable: false },
              { apiName: "product_id", label: "Product", fieldType: "lookup", required: true, writable: false },
              { apiName: "batch_number", label: "Batch Number", fieldType: "text", required: true, writable: false },
              { apiName: "expiry_date", label: "Expiry Date", fieldType: "date", writable: false },
              { apiName: "quantity", label: "Quantity", fieldType: "number", required: true, writable: false },
              { apiName: "created_at", label: "Created", fieldType: "datetime", writable: false }
            ],
          },
        ],
        relationships: [
          { parentObjectKey: "product", childObjectKey: "inventory_batch", relationshipKey: "batches", relationshipType: "one_to_many", childFieldApiName: "product_id" },
          { parentObjectKey: "store", childObjectKey: "inventory_batch", relationshipKey: "inventory_batches", relationshipType: "one_to_many", childFieldApiName: "store_id" },
        ],
        listViews: [
          { objectKey: "inventory_batch", viewKey: "all", label: "All Batches", columns: ["product_id","batch_number","expiry_date","quantity"], isDefault: true },
          { objectKey: "inventory_batch", viewKey: "expiring", label: "Expiring Batches", columns: ["product_id","batch_number","expiry_date","quantity"] }
        ],
      } : {}),
      ...(entry.key === "finance_core" ? {
        objects: [
          {
            objectKey: "supplier_invoice",
            metadataScope: "global",
            label: "Supplier Invoice",
            pluralLabel: "Supplier Invoices",
            description: "Authoritative supplier invoice records.",
            sourceTable: "supplier_invoices",
            required: true,
            adoptFromPackageKeys: ["retail_pos"],
            config: { flowWritesOnly: true },
            fields: [
              { apiName: "company_id", label: "Company", fieldType: "lookup", sourceColumn: "company_id", required: true, writable: false },
              { apiName: "supplier_id", label: "Supplier", fieldType: "lookup", sourceColumn: "supplier_id", required: true, writable: true },
              { apiName: "store_id", label: "Store", fieldType: "lookup", sourceColumn: "store_id", writable: true },
              { apiName: "purchase_id", label: "Purchase Order", fieldType: "lookup", sourceColumn: "purchase_id", writable: true },
              { apiName: "invoice_number", label: "Invoice Number", fieldType: "text", sourceColumn: "invoice_number", required: true, writable: true },
              { apiName: "invoice_date", label: "Invoice Date", fieldType: "date", sourceColumn: "invoice_date", required: true, writable: true },
              { apiName: "due_date", label: "Due Date", fieldType: "date", sourceColumn: "due_date", writable: true },
              { apiName: "subtotal", label: "Subtotal", fieldType: "currency", sourceColumn: "subtotal", required: true, writable: true },
              { apiName: "tax", label: "VAT / Tax", fieldType: "currency", sourceColumn: "tax", required: true, writable: true },
              { apiName: "total", label: "Total", fieldType: "currency", sourceColumn: "total", required: true, writable: true },
              { apiName: "status", label: "Status", fieldType: "picklist", sourceColumn: "status", required: true, writable: true, options: ["OPEN", "PARTIALLY_PAID", "PAID", "VOID"] },
              { apiName: "paid_amount", label: "Paid", fieldType: "rollup", writable: false, config: { operation: "SUM", relationshipKey: "allocations", field: "amount", resultType: "currency" } },
              { apiName: "outstanding_amount", label: "Outstanding", fieldType: "formula", writable: false, config: { expression: "MAX(total - paid_amount, 0)", resultType: "currency" } },
              { apiName: "created_at", label: "Created", fieldType: "datetime", sourceColumn: "created_at", writable: false },
              { apiName: "updated_at", label: "Updated", fieldType: "datetime", sourceColumn: "updated_at", writable: false },
            ],
          },
          {
            objectKey: "supplier_payment",
            metadataScope: "global",
            label: "Supplier Payment",
            pluralLabel: "Supplier Payments",
            description: "Authoritative supplier-account payment records.",
            sourceTable: "supplier_payments",
            required: true,
            adoptFromPackageKeys: ["retail_pos"],
            config: { flowWritesOnly: true },
            fields: [
              { apiName: "company_id", label: "Company", fieldType: "lookup", sourceColumn: "company_id", required: true, writable: false },
              { apiName: "supplier_id", label: "Supplier", fieldType: "lookup", sourceColumn: "supplier_id", required: true, writable: true },
              { apiName: "store_id", label: "Store", fieldType: "lookup", sourceColumn: "store_id", writable: true },
              { apiName: "amount", label: "Amount", fieldType: "currency", sourceColumn: "amount", required: true, writable: true },
              { apiName: "payment_date", label: "Payment Date", fieldType: "date", sourceColumn: "payment_date", required: true, writable: true },
              { apiName: "payment_method", label: "Payment Method", fieldType: "text", sourceColumn: "payment_method", writable: true },
              { apiName: "reference", label: "Reference", fieldType: "text", sourceColumn: "reference", writable: true },
              { apiName: "status", label: "Status", fieldType: "picklist", sourceColumn: "status", required: true, writable: true, options: ["PENDING", "COMPLETED", "CANCELLED"] },
              { apiName: "created_at", label: "Created", fieldType: "datetime", sourceColumn: "created_at", writable: false },
            ],
          },
          {
            objectKey: "supplier_payment_allocation",
            metadataScope: "global",
            label: "Payment Allocation",
            pluralLabel: "Payment Allocations",
            description: "Authoritative junction between supplier payments and invoices.",
            sourceTable: "supplier_payment_allocations",
            required: true,
            adoptFromPackageKeys: ["retail_pos"],
            config: { flowWritesOnly: true },
            fields: [
              { apiName: "payment_id", label: "Supplier Payment", fieldType: "lookup", sourceColumn: "payment_id", required: true, writable: true },
              { apiName: "invoice_id", label: "Supplier Invoice", fieldType: "lookup", sourceColumn: "invoice_id", required: true, writable: true },
              { apiName: "amount", label: "Allocated Amount", fieldType: "currency", sourceColumn: "amount", required: true, writable: true },
            ],
          },
          {
            objectKey: "supplier_ledger",
            metadataScope: "global",
            label: "Supplier Ledger Entry",
            pluralLabel: "Supplier Ledger Entries",
            description: "Authoritative supplier-account ledger entries.",
            sourceTable: "supplier_ledger_entries",
            required: true,
            adoptFromPackageKeys: ["retail_pos"],
            config: { flowWritesOnly: true },
            fields: [
              { apiName: "company_id", label: "Company", fieldType: "lookup", sourceColumn: "company_id", required: true, writable: false },
              { apiName: "supplier_id", label: "Supplier", fieldType: "lookup", sourceColumn: "supplier_id", required: true, writable: true },
              { apiName: "store_id", label: "Store", fieldType: "lookup", sourceColumn: "store_id", writable: true },
              { apiName: "entry_type", label: "Entry Type", fieldType: "picklist", sourceColumn: "entry_type", required: true, writable: true, options: ["INVOICE", "PAYMENT", "RETURN_CREDIT", "OPENING"] },
              { apiName: "reference_type", label: "Reference Type", fieldType: "text", sourceColumn: "reference_type", writable: true },
              { apiName: "reference_id", label: "Source Reference", fieldType: "lookup", sourceColumn: "reference_id", writable: true },
              { apiName: "reference", label: "Reference", fieldType: "text", sourceColumn: "reference", writable: true },
              { apiName: "amount", label: "Amount", fieldType: "currency", sourceColumn: "amount", required: true, writable: true },
              { apiName: "debit", label: "Debit", fieldType: "boolean", sourceColumn: "debit", required: true, writable: true },
              { apiName: "created_at", label: "Created", fieldType: "datetime", sourceColumn: "created_at", writable: false },
            ],
          },
          {
            objectKey: "financial_ledger",
            metadataScope: "global",
            label: "Financial Ledger Entry",
            pluralLabel: "Financial Ledger Entries",
            description: "Shared financial ledger contract backed by existing entries.",
            sourceTable: "financial_ledger_entries",
            required: true,
            adoptFromPackageKeys: ["retail_pos"],
            config: { flowWritesOnly: true },
            fields: [
              { apiName: "company_id", label: "Company", fieldType: "lookup", sourceColumn: "company_id", required: true, writable: false },
              { apiName: "transaction_id", label: "Transaction", fieldType: "lookup", sourceColumn: "transaction_id", writable: false },
              { apiName: "payment_id", label: "Payment", fieldType: "lookup", sourceColumn: "payment_id", writable: true },
              { apiName: "customer_id", label: "Customer", fieldType: "lookup", sourceColumn: "customer_id", writable: false },
              { apiName: "supplier_id", label: "Supplier", fieldType: "lookup", sourceColumn: "supplier_id", writable: true },
              { apiName: "supplier_invoice_id", label: "Supplier Invoice", fieldType: "lookup", sourceColumn: "supplier_invoice_id", writable: false },
              { apiName: "transaction_type", label: "Transaction Type", fieldType: "text", sourceColumn: "transaction_type", required: true, writable: false },
              { apiName: "debit", label: "Debit", fieldType: "currency", sourceColumn: "debit", writable: true },
              { apiName: "credit", label: "Credit", fieldType: "currency", sourceColumn: "credit", writable: false },
              { apiName: "amount", label: "Amount", fieldType: "currency", sourceColumn: "amount", required: true, writable: true },
              { apiName: "net_amount", label: "Net Amount", fieldType: "currency", sourceColumn: "net_amount", writable: false },
              { apiName: "vat_amount", label: "VAT / Tax", fieldType: "currency", sourceColumn: "vat_amount", writable: false },
              { apiName: "reference", label: "Reference", fieldType: "text", sourceColumn: "reference", writable: true },
              { apiName: "status", label: "Status", fieldType: "text", sourceColumn: "status", writable: true },
              { apiName: "created_at", label: "Created", fieldType: "datetime", sourceColumn: "created_at", writable: false },
            ],
          },
        ],
        relationships: [
          { parentObjectKey: "supplier", childObjectKey: "supplier_invoice", relationshipKey: "invoices", relationshipType: "one_to_many", childFieldApiName: "supplier_id", required: true },
          { parentObjectKey: "supplier_invoice", childObjectKey: "supplier", relationshipKey: "supplier", relationshipType: "lookup", parentFieldApiName: "supplier_id", required: true },
          { parentObjectKey: "supplier_invoice", childObjectKey: "supplier_payment_allocation", relationshipKey: "allocations", relationshipType: "one_to_many", childFieldApiName: "invoice_id", required: true },
          { parentObjectKey: "supplier", childObjectKey: "supplier_payment", relationshipKey: "payments", relationshipType: "one_to_many", childFieldApiName: "supplier_id", required: true },
          { parentObjectKey: "supplier_payment", childObjectKey: "supplier", relationshipKey: "supplier", relationshipType: "lookup", parentFieldApiName: "supplier_id", required: true },
          { parentObjectKey: "supplier_payment", childObjectKey: "supplier_payment_allocation", relationshipKey: "allocations", relationshipType: "one_to_many", childFieldApiName: "payment_id", required: true },
          { parentObjectKey: "supplier_payment_allocation", childObjectKey: "supplier_payment", relationshipKey: "payment", relationshipType: "lookup", parentFieldApiName: "payment_id", required: true },
          { parentObjectKey: "supplier_payment_allocation", childObjectKey: "supplier_invoice", relationshipKey: "invoice", relationshipType: "lookup", parentFieldApiName: "invoice_id", required: true },
          { parentObjectKey: "supplier_invoice", childObjectKey: "purchase", relationshipKey: "purchase_order", relationshipType: "lookup", parentFieldApiName: "purchase_id" },
          { parentObjectKey: "supplier_ledger", childObjectKey: "supplier", relationshipKey: "supplier", relationshipType: "lookup", parentFieldApiName: "supplier_id", required: true },
          { parentObjectKey: "financial_ledger", childObjectKey: "supplier", relationshipKey: "supplier", relationshipType: "lookup", parentFieldApiName: "supplier_id" },
        ],
        listViews: [
          { objectKey: "supplier_invoice", viewKey: "supplier_invoices", label: "Supplier Invoices", columns: ["invoice_number", "invoice_date", "due_date", "total", "paid_amount", "outstanding_amount", "status"], isDefault: true },
          { objectKey: "supplier_payment", viewKey: "supplier_payments", label: "Supplier Payments", columns: ["payment_date", "amount", "payment_method", "reference", "status"], isDefault: true },
          { objectKey: "supplier_ledger", viewKey: "supplier_ledger", label: "Supplier Statement", columns: ["created_at", "entry_type", "reference", "description", "amount", "debit"], sort: { field: "created_at", direction: "asc" }, isDefault: true },
          { objectKey: "financial_ledger", viewKey: "financial_ledger", label: "Financial Ledger", columns: ["transaction_type", "supplier_id", "amount", "debit", "credit", "reference", "created_at"] },
        ],
        workflows: [
          { objectKey: "supplier", name: "Supplier Invoice Create", triggerKey: "manual", active: true, lifecycleStatus: "ACTIVE", actions: [{ id:"supplier_invoice_create", label:"Create Invoice", key:"RUN_SUBFLOW", subflowApiName:"SUPPLIER_INVOICE_CREATE", inputAssignments:{ supplierId:{path:"record.id"}, invoiceNumber:{path:"record.invoiceNumber"}, invoiceDate:{path:"record.invoiceDate"}, dueDate:{path:"record.dueDate"}, subtotal:{path:"record.subtotal"}, tax:{path:"record.tax"}, total:{path:"record.total"}, purchaseId:{path:"record.purchaseId"} } }] },
          { objectKey: "supplier", name: "Supplier Payment Execute", triggerKey: "manual", active: true, lifecycleStatus: "ACTIVE", actions: [{ id:"supplier_payment_execute", label:"Record Payment", key:"RUN_SUBFLOW", subflowApiName:"SUPPLIER_PAYMENT_CREATE", inputAssignments:{ supplierId:{path:"record.id"}, amount:{path:"record.amount"}, paymentDate:{path:"record.paymentDate"}, paymentMethod:{path:"record.paymentMethod"}, reference:{path:"record.reference"}, invoiceId:{path:"record.invoiceId"} } }] },
          { objectKey: "supplier", name: "Supplier Credit Create", triggerKey: "manual", active: true, lifecycleStatus: "ACTIVE", actions: [{ id:"supplier_credit_create", label:"Supplier Credit Create", key:"RUN_SUBFLOW", subflowApiName:"SUPPLIER_LEDGER_ADJUST", inputAssignments:{ supplierId:{path:"record.id"}, entryType:"RETURN_CREDIT", debit:false, amount:{path:"record.amount"}, reference:{path:"record.reference"}, description:{path:"record.description"} } }] },
          { objectKey: "supplier", name: "Supplier Debit Create", triggerKey: "manual", active: true, lifecycleStatus: "ACTIVE", actions: [{ id:"supplier_debit_create", label:"Supplier Debit Create", key:"RUN_SUBFLOW", subflowApiName:"SUPPLIER_LEDGER_ADJUST", inputAssignments:{ supplierId:{path:"record.id"}, entryType:"OPENING", debit:true, amount:{path:"record.amount"}, reference:{path:"record.reference"}, description:{path:"record.description"} } }] },
          { objectKey: "supplier", name: "Supplier Credit Note Create", triggerKey: "manual", active: true, lifecycleStatus: "ACTIVE", actions: [{ id:"supplier_credit_note_create", label:"Supplier Credit Note Create", key:"RUN_SUBFLOW", subflowApiName:"SUPPLIER_LEDGER_ADJUST", inputAssignments:{ supplierId:{path:"record.id"}, entryType:"RETURN_CREDIT", debit:false, amount:{path:"record.amount"}, reference:{path:"record.reference"}, description:{path:"record.description"} } }] },
        ],
        buttons: [
          { objectKey: "supplier", buttonKey: "supplier_add_invoice", label: "Add Invoice", targetType: "workflow", targetKey: "Supplier Invoice Create", placement: "record", variant: "primary",
            config: { order: 20, requiredPermissionsAny: ["purchase.edit","inventory.adjust"], form: { submitLabel: "Add Invoice", fields: [
              { name: "invoiceNumber", label: "Invoice number", type: "text", required: true }, { name: "invoiceDate", label: "Invoice date", type: "date", defaultValue: "today" },
              { name: "dueDate", label: "Due date", type: "date" }, { name: "subtotal", label: "Subtotal", type: "number", min: 0, step: 0.01 },
              { name: "tax", label: "Tax", type: "number", min: 0, step: 0.01, defaultValue: 0 }, { name: "total", label: "Total", type: "number", min: 0, step: 0.01, required: true },
              { name: "notes", label: "Notes", type: "textarea" }
            ] } } },
          { objectKey: "supplier", buttonKey: "supplier_record_payment", label: "Record Payment", targetType: "workflow", targetKey: "Supplier Payment Execute", placement: "record", variant: "primary",
            config: { order: 30, requiredPermissionsAny: ["payment.manage","purchase.edit","inventory.adjust"], form: { submitLabel: "Record Payment", fields: [
              { name: "amount", label: "Amount", type: "number", min: 0.01, step: 0.01, required: true },
              { name: "paymentMethod", label: "Method", type: "select", defaultValue: "BANK", options: [{value:"BANK",label:"Bank"},{value:"CASH",label:"Cash"},{value:"CARD",label:"Card"},{value:"OTHER",label:"Other"}] },
              { name: "invoiceId", label: "Allocate to invoice", type: "related_select", optionsSource: { relationshipKey: "invoices", valueField: "id", labelFields: ["invoice_number","outstanding_amount"], filter: { field: "outstanding_amount", operator: "greater_than", value: 0 } } },
              { name: "reference", label: "Reference", type: "text" }, { name: "idempotencyKey", type: "uuid" }
            ] } } },
          { objectKey: "supplier", buttonKey: "supplier_add_credit", label: "Add Credit", targetType: "workflow", targetKey: "Supplier Credit Create", placement: "record", variant: "secondary",
            config: { order: 40, requiredPermissionsAny: ["purchase.edit","inventory.adjust"], form: { submitLabel: "Add Credit", fields: [
              { name: "amount", label: "Amount", type: "number", min: 0.01, step: 0.01, required: true }, { name: "reference", label: "Reference", type: "text" },
              { name: "description", label: "Reason / notes", type: "textarea" }, { name: "idempotencyKey", type: "uuid" }
            ] } } },
          { objectKey: "supplier", buttonKey: "supplier_add_debit", label: "Add Debit", targetType: "workflow", targetKey: "Supplier Debit Create", placement: "record", variant: "secondary",
            config: { order: 50, requiredPermissionsAny: ["purchase.edit","inventory.adjust"], form: { submitLabel: "Add Debit", fields: [
              { name: "amount", label: "Amount", type: "number", min: 0.01, step: 0.01, required: true }, { name: "reference", label: "Reference", type: "text" },
              { name: "description", label: "Reason / notes", type: "textarea" }, { name: "idempotencyKey", type: "uuid" }
            ] } } },
          { objectKey: "supplier", buttonKey: "supplier_add_credit_note", label: "Credit Note", targetType: "workflow", targetKey: "Supplier Credit Note Create", placement: "record", variant: "secondary",
            config: { order: 60, requiredPermissionsAny: ["purchase.edit","inventory.adjust"], form: { submitLabel: "Add Credit Note", fields: [
              { name: "amount", label: "Amount", type: "number", min: 0.01, step: 0.01, required: true }, { name: "reference", label: "Credit note number", type: "text", required: true },
              { name: "description", label: "Reason / notes", type: "textarea" }, { name: "idempotencyKey", type: "uuid" }
            ] } } },
        ],
        permissionDeclarations: [
          { permission: "purchase.view", label: "View supplier accounting" },
          { permission: "purchase.edit", label: "Manage supplier invoices and payments" },
          { permission: "inventory.adjust", label: "Post supplier account adjustments" },
          { permission: "reports.payments.view", label: "View financial ledger" },
        ],
      } : {}),
      ...(entry.key === "hospitality" ? {
        objects: [
          { objectKey: "hospitality_floor", label: "Floor", pluralLabel: "Floors", sourceTable: "hospitality_floors", fields: [
            { apiName: "store_id", label: "Store", fieldType: "lookup", required: true, writable: true },
            { apiName: "name", label: "Name", fieldType: "text", required: true, writable: true },
            { apiName: "display_order", label: "Display Order", fieldType: "number", writable: true },
            { apiName: "active", label: "Active", fieldType: "boolean", writable: true }
          ]},
          { objectKey: "hospitality_table", label: "Table", pluralLabel: "Tables", sourceTable: "hospitality_tables", fields: [
            { apiName: "store_id", label: "Store", fieldType: "lookup", required: true, writable: true },
            { apiName: "floor_id", label: "Floor", fieldType: "lookup", required: true, writable: true },
            { apiName: "table_number", label: "Table Number", fieldType: "text", required: true, writable: true },
            { apiName: "capacity", label: "Capacity", fieldType: "number", required: true, writable: true },
            { apiName: "shape", label: "Shape", fieldType: "picklist", writable: true, options: ["square","round","rectangle"] },
            { apiName: "position_x", label: "X", fieldType: "number", writable: true },
            { apiName: "position_y", label: "Y", fieldType: "number", writable: true },
            { apiName: "active", label: "Active", fieldType: "boolean", writable: true }
          ]},
          { objectKey: "hospitality_reservation", label: "Reservation", pluralLabel: "Reservations", sourceTable: "hospitality_reservations", fields: [
            { apiName: "store_id", label: "Store", fieldType: "lookup", required: true, writable: true },
            { apiName: "table_id", label: "Table", fieldType: "lookup", writable: true },
            { apiName: "customer_id", label: "Customer", fieldType: "lookup", writable: true },
            { apiName: "customer_name", label: "Customer Name", fieldType: "text", required: true, writable: true },
            { apiName: "reservation_date", label: "Date", fieldType: "date", required: true, writable: true },
            { apiName: "reservation_time", label: "Time", fieldType: "text", required: true, writable: true },
            { apiName: "guests", label: "Guests", fieldType: "number", required: true, writable: true },
            { apiName: "status", label: "Status", fieldType: "picklist", writable: true, options: ["RESERVED","SEATED","CANCELLED","COMPLETED"] }
          ]},
          { objectKey: "hospitality_report_session", label: "Hospitality Session Report", pluralLabel: "Hospitality Session Reports", sourceTable: "hospitality_report_sessions", storeScoped: true, fields: [
            { apiName: "report_date", label: "Date", fieldType: "date", writable: false },
            { apiName: "store_id", label: "Store", fieldType: "lookup", writable: false },
            { apiName: "floor_name", label: "Floor", fieldType: "text", writable: false },
            { apiName: "table_number", label: "Table", fieldType: "text", writable: false },
            { apiName: "session_id", label: "Hospitality Session", fieldType: "text", writable: false },
            { apiName: "operator_name", label: "Operator", fieldType: "text", writable: false },
            { apiName: "status", label: "Session Status", fieldType: "text", writable: false },
            { apiName: "guests", label: "Covers", fieldType: "number", writable: false },
            { apiName: "source", label: "Reservation / Walk-in", fieldType: "text", writable: false },
            { apiName: "gross", label: "Gross", fieldType: "currency", writable: false },
            { apiName: "discount", label: "Discount", fieldType: "currency", writable: false },
            { apiName: "net", label: "Net", fieldType: "currency", writable: false },
            { apiName: "vat", label: "VAT", fieldType: "currency", writable: false },
            { apiName: "service_charge", label: "Service Charge", fieldType: "currency", writable: false },
            { apiName: "tips", label: "Tips", fieldType: "currency", writable: false },
            { apiName: "paid", label: "Total Paid", fieldType: "currency", writable: false },
            { apiName: "remaining", label: "Remaining Balance", fieldType: "currency", writable: false },
            { apiName: "payment_method", label: "Payment Method", fieldType: "text", writable: false },
            { apiName: "payment_count", label: "Payment Count", fieldType: "number", writable: false },
            { apiName: "opened_at", label: "Opened", fieldType: "datetime", writable: false },
            { apiName: "closed_at", label: "Closed", fieldType: "datetime", writable: false },
            { apiName: "duration_minutes", label: "Duration", fieldType: "number", writable: false },
            { apiName: "average_spend_per_cover", label: "Average Spend Per Cover", fieldType: "currency", writable: false },
            { apiName: "ticket_created", label: "KDS Ticket Created", fieldType: "datetime", writable: false },
            { apiName: "ticket_completed", label: "KDS Ticket Completed", fieldType: "datetime", writable: false },
            { apiName: "preparation_duration", label: "Preparation Duration", fieldType: "number", writable: false },
            { apiName: "delayed", label: "Delayed Ticket", fieldType: "boolean", writable: false }
          ]}
        ],
        relationships: [
          { parentObjectKey: "hospitality_floor", childObjectKey: "hospitality_table", relationshipKey: "tables", relationshipType: "one_to_many", childFieldApiName: "floor_id" },
          { parentObjectKey: "hospitality_table", childObjectKey: "hospitality_reservation", relationshipKey: "reservations", relationshipType: "one_to_many", childFieldApiName: "table_id" },
          { parentObjectKey: "customer", childObjectKey: "hospitality_reservation", relationshipKey: "reservations", relationshipType: "one_to_many", childFieldApiName: "customer_id" }
        ],
        listViews: [
          { objectKey: "hospitality_table", viewKey: "all", label: "All Tables", columns: ["table_number","capacity","shape","active"], isDefault: true },
          { objectKey: "hospitality_reservation", viewKey: "upcoming", label: "Upcoming Reservations", columns: ["reservation_date","reservation_time","customer_name","guests","status"], isDefault: true }
        ],
        permissions: [
          "hospitality.tables.view",
          "hospitality.tables.manage",
          "hospitality.floor.manage",
          "hospitality.reservations.view",
          "hospitality.reservations.manage",
          "hospitality.kds.view",
          "hospitality.kds.manage",
          "hospitality.kitchen.reprint",
          "hospitality.bill.split",
          "hospitality.bill.pay",
          "hospitality.table.transfer",
          "hospitality.service_charge.override",
          "hospitality.qr.manage"
        ],
        permissionDeclarations: [
          { permission: "hospitality.tables.view", label: "View Hospitality tables" },
          { permission: "hospitality.tables.manage", label: "Manage Hospitality tables" },
          { permission: "hospitality.floor.manage", label: "Manage Hospitality floor plans" },
          { permission: "hospitality.reservations.view", label: "View Hospitality reservations" },
          { permission: "hospitality.reservations.manage", label: "Manage Hospitality reservations" },
          { permission: "hospitality.kds.view", label: "View kitchen display" },
          { permission: "hospitality.kds.manage", label: "Manage kitchen display" },
          { permission: "hospitality.kitchen.reprint", label: "Reprint kitchen tickets" },
          { permission: "hospitality.bill.split", label: "Split hospitality bills" },
          { permission: "hospitality.bill.pay", label: "Take Hospitality Bill Payments" },
          { permission: "hospitality.table.transfer", label: "Transfer hospitality tables" },
          { permission: "hospitality.service_charge.override", label: "Override service charges" },
          { permission: "hospitality.qr.manage", label: "Manage QR ordering" }
        ],
        pages: [
          { pageKey: "hospitality", label: "Hospitality", routePath: "/app/custom/hospitality", runtimeComponent: "hospitality_operations" }
        ]
      } : {}),
      ...(entry.key === "own_delivery" ? {
        permissionDeclarations: [
          { permission: "online_orders.view", label: "View own-delivery queue" },
          { permission: "online_orders.manage", label: "Assign and dispatch own deliveries" },
          { permission: "delivery.driver", label: "View and update assigned deliveries only" },
        ],
        pages: [
          {
            pageKey: "own_delivery",
            label: "Own Delivery",
            routePath: "/app/custom/own-delivery",
            runtimeComponent: "delivery_workspace",
            definition: { presentation_mode: "landing", runtime_component: "delivery_workspace", components: [] },
          },
        ],
      } : {}),
      ...(entry.key === "kds" ? {
        objects: [
          { objectKey: "kds_ticket", label: "Kitchen Ticket", pluralLabel: "Kitchen Tickets", sourceTable: "hospitality_kds_tickets", fields: [
            { apiName: "store_id", label: "Store", fieldType: "lookup", required: true, writable: false },
            { apiName: "sale_id", label: "Sale", fieldType: "lookup", writable: false },
            { apiName: "table_id", label: "Table", fieldType: "lookup", writable: false },
            { apiName: "status", label: "Status", fieldType: "picklist", required: true, writable: true, options: ["NEW","IN_PREPARATION","READY","COMPLETED"] },
            { apiName: "items", label: "Items", fieldType: "text", writable: false },
            { apiName: "created_at", label: "Created", fieldType: "datetime", writable: false }
          ]}
        ],
        relationships: [
          { parentObjectKey: "sale", childObjectKey: "kds_ticket", relationshipKey: "kitchen_tickets", relationshipType: "one_to_many", childFieldApiName: "sale_id" },
          { parentObjectKey: "hospitality_table", childObjectKey: "kds_ticket", relationshipKey: "kitchen_tickets", relationshipType: "one_to_many", childFieldApiName: "table_id" }
        ],
        listViews: [
          { objectKey: "kds_ticket", viewKey: "active", label: "Active Kitchen Tickets", columns: ["sale_id","table_id","status","created_at"], isDefault: true }
        ],
        permissionDeclarations: [
          { permission: "hospitality.kds.view", label: "View KDS" },
          { permission: "hospitality.kds.manage", label: "Manage KDS" },
          { permission: "hospitality.kitchen.reprint", label: "Reprint kitchen tickets" }
        ],
        pages: [
          { pageKey: "kds", label: "Kitchen Display", routePath: "/app/custom/kds", runtimeComponent: "kitchen_display" }
        ]
      } : {}),
      ...(entry.key === "customer_credit" ? {
        objects: [
          {
            objectKey: "customer_credit_account",
            label: "Customer Credit Account",
            pluralLabel: "Customer Credit Accounts",
            description: "Customer credit configuration and derived account exposure.",
            sourceTable: "customers",
            fields: [
              { apiName: "credit_enabled", label: "Credit Enabled", fieldType: "boolean", writable: false },
              { apiName: "credit_limit", label: "Credit Limit", fieldType: "currency", writable: false },
            ],
          },
          {
            objectKey: "customer_credit_ledger",
            label: "Customer Credit Ledger Entry",
            pluralLabel: "Customer Credit Ledger Entries",
            description: "Immutable customer credit transactions.",
            sourceTable: "customer_credit_ledger",
            fields: [
              { apiName: "customer_id", label: "Customer", fieldType: "lookup", writable: false },
              { apiName: "store_id", label: "Store", fieldType: "lookup", writable: false },
              { apiName: "transaction_type", label: "Transaction Type", fieldType: "text", writable: false },
              { apiName: "amount", label: "Amount", fieldType: "currency", writable: false },
              { apiName: "balance_after", label: "Balance After", fieldType: "currency", writable: false },
              { apiName: "reference_type", label: "Reference Type", fieldType: "text", writable: false },
              { apiName: "reference_id", label: "Reference", fieldType: "lookup", writable: false },
              { apiName: "description", label: "Description", fieldType: "text", writable: false },
              { apiName: "payment_method", label: "Payment Method", fieldType: "text", writable: false },
              { apiName: "created_by", label: "Operator", fieldType: "lookup", writable: false },
              { apiName: "created_at", label: "Created", fieldType: "datetime", writable: false },
            ],
          },
        ],
        relationships: [
          { parentObjectKey: "customer", childObjectKey: "customer_credit_account", relationshipKey: "credit_account", relationshipType: "lookup" },
          { parentObjectKey: "customer_credit_account", childObjectKey: "customer_credit_ledger", relationshipKey: "ledger_entries", relationshipType: "one_to_many", childFieldApiName: "customer_id" },
        ],
        listViews: [
          { objectKey: "customer_credit_account", viewKey: "all", label: "All Credit Accounts", columns: ["credit_enabled", "credit_limit"], isDefault: true },
          { objectKey: "customer_credit_account", viewKey: "active", label: "Active", filters: { credit_enabled: true } },
          { objectKey: "customer_credit_account", viewKey: "disabled", label: "Credit Disabled", filters: { credit_enabled: false } },
          { objectKey: "customer_credit_ledger", viewKey: "all", label: "Credit Ledger Activity", columns: ["customer_id", "transaction_type", "amount", "created_at"], isDefault: true },
        ],
        rules: [
          {
            objectKey: "customer_credit_account",
            name: "Credit limit cannot be negative",
            triggerKey: "before_save",
            conditions: [{ field: "credit_limit", operator: "less_than", value: 0 }],
            action: { type: "validation", message: "Credit limit cannot be negative" },
          },
          {
            objectKey: "customer_credit_account",
            name: "Credit enabled requires a limit",
            triggerKey: "before_save",
            conditions: [{ field: "credit_enabled", operator: "equals", value: true }, { field: "credit_limit", operator: "is_empty" }],
            action: { type: "validation", message: "A credit limit is required when credit is enabled" },
          },
          {
            objectKey: "customer_credit_ledger",
            name: "Credit payment received notification",
            triggerKey: "after_save",
            conditions: [{ field: "transaction_type", operator: "equals", value: "payment" }],
            action: { type: "send_in_app_notification", title: "Credit payment received" },
          },
        ],
      } : {}),
      ...(entry.key === "customers" ? {
        objects: [
          {
            objectKey: "customer",
            label: "Customer",
            pluralLabel: "Customers",
            description: "Canonical customer record for person and business relationships.",
            sourceTable: "customers",
            fields: [
              { apiName: "customer_number", label: "Customer Number", fieldType: "text", writable: false },
              { apiName: "display_name", label: "Display Name", fieldType: "text", required: true, writable: true },
              { apiName: "default_contact_id", label: "Default Contact", fieldType: "lookup", writable: true },
              { apiName: "default_address_id", label: "Default Address", fieldType: "lookup", writable: true },
              { apiName: "status", label: "Status", fieldType: "picklist", options: ["ACTIVE", "INACTIVE", "BLOCKED"], writable: true },
            ],
          },
          {
            objectKey: "contact",
            label: "Contact",
            pluralLabel: "Contacts",
            description: "Reusable contact details that can be shared across customer, sales, and CRM workflows.",
            sourceTable: "contacts",
            fields: [
              { apiName: "customer_id", label: "Customer", fieldType: "lookup", required: true, writable: true },
              { apiName: "first_name", label: "First Name", fieldType: "text", writable: true },
              { apiName: "last_name", label: "Last Name", fieldType: "text", writable: true },
              { apiName: "name", label: "Contact Name", fieldType: "text", required: true, writable: true },
              { apiName: "email", label: "Email", fieldType: "email", writable: true },
              { apiName: "phone", label: "Phone", fieldType: "phone", writable: true },
              { apiName: "job_title", label: "Job Title", fieldType: "text", writable: true },
              { apiName: "is_primary", label: "Primary Contact", fieldType: "boolean", writable: true },
              { apiName: "active", label: "Active", fieldType: "boolean", writable: true },
            ],
          },
          {
            objectKey: "address",
            label: "Address",
            pluralLabel: "Addresses",
            description: "Reusable address records for billing, shipping, and customer communication.",
            sourceTable: "addresses",
            fields: [
              { apiName: "customer_id", label: "Customer", fieldType: "lookup", required: true, writable: true },
              { apiName: "address_type", label: "Address Type", fieldType: "picklist", options: ["HOME", "WORK", "BILLING", "SHIPPING"], writable: true },
              { apiName: "line_1", label: "Address Line 1", fieldType: "text", required: true, writable: true },
              { apiName: "line_2", label: "Address Line 2", fieldType: "text", writable: true },
              { apiName: "city", label: "City", fieldType: "text", writable: true },
              { apiName: "region", label: "Region / State", fieldType: "text", writable: true },
              { apiName: "postcode", label: "Postcode", fieldType: "text", writable: true },
              { apiName: "country", label: "Country", fieldType: "text", writable: true },
              { apiName: "is_default", label: "Default Address", fieldType: "boolean", writable: true },
              { apiName: "is_billing", label: "Billing Address", fieldType: "boolean", writable: true },
              { apiName: "is_shipping", label: "Shipping Address", fieldType: "boolean", writable: true },
              { apiName: "active", label: "Active", fieldType: "boolean", writable: true },
            ],
          },
        ],
        relationships: [
          { parentObjectKey: "customer", childObjectKey: "contact", relationshipKey: "contacts", relationshipType: "one_to_many", childFieldApiName: "customer_id" },
          { parentObjectKey: "customer", childObjectKey: "address", relationshipKey: "addresses", relationshipType: "one_to_many", childFieldApiName: "customer_id" },
        ],
        listViews: [
          { objectKey: "customer", viewKey: "all", label: "All Customers", columns: ["customer_number", "display_name", "email", "phone", "status"], isDefault: true },
          { objectKey: "contact", viewKey: "all", label: "All Contacts", columns: ["name", "email", "phone", "job_title"], isDefault: true },
          { objectKey: "address", viewKey: "all", label: "All Addresses", columns: ["line_1", "city", "postcode", "address_type"], isDefault: true },
        ],
        actions: [
          { actionKey: "customer.add_contact", objectKey: "customer", label: "Add Contact", description: "Create a related contact for this customer.", handlerKey: "ADD_CONTACT", requiredPermission: "customer.edit" },
          { actionKey: "customer.add_address", objectKey: "customer", label: "Add Address", description: "Create a related address for this customer.", handlerKey: "ADD_ADDRESS", requiredPermission: "customer.edit" },
        ],
        rules: [
          {
            objectKey: "contact",
            name: "Contact has a name",
            triggerKey: "before_save",
            conditions: [{ field: "name", operator: "is_empty" }],
            action: { type: "validation", message: "Contact name is required" },
          },
          {
            objectKey: "address",
            name: "Address line 1 is required",
            triggerKey: "before_save",
            conditions: [{ field: "line_1", operator: "is_empty" }],
            action: { type: "validation", message: "Address line 1 is required" },
          },
          {
            objectKey: "customer",
            name: "Customer name is required",
            triggerKey: "before_save",
            conditions: [{ field: "display_name", operator: "is_empty" }],
            action: { type: "validation", message: "Customer display name is required" },
          },
        ],
      } : {}),
      ...(entry.key === "loyalty" ? {
        objects: [
          {
            objectKey: "loyalty_configuration",
            metadataScope: "global",
            label: "Loyalty Configuration",
            pluralLabel: "Loyalty Configurations",
            description: "Company-level loyalty programme settings. Values remain authoritative in company_settings.",
            sourceTable: "company_settings",
            fields: [
              { apiName: "company_id", label: "Company", fieldType: "lookup", required: true, writable: false },
              { apiName: "loyalty_enabled", label: "Enabled", fieldType: "boolean", writable: false },
              { apiName: "loyalty_earning_rate", label: "Earn Rate", fieldType: "decimal", writable: false },
              { apiName: "loyalty_min_sale_total", label: "Minimum Qualifying Sale", fieldType: "currency", writable: false },
              { apiName: "loyalty_redeem_value_per_point", label: "Redemption Value per Point", fieldType: "decimal", writable: false },
              { apiName: "loyalty_min_points_redeem", label: "Minimum Redemption Points", fieldType: "number", writable: false },
              { apiName: "updated_at", label: "Updated", fieldType: "datetime", writable: false },
            ],
          },
          {
            objectKey: "loyalty_account",
            metadataScope: "global",
            label: "Loyalty Account",
            pluralLabel: "Loyalty Accounts",
            description: "Customer loyalty balance. The balance remains authoritative in customer_loyalty_balances.",
            sourceTable: "customer_loyalty_balances",
            fields: [
              { apiName: "company_id", label: "Company", fieldType: "lookup", required: true, writable: false },
              { apiName: "customer_id", label: "Customer", fieldType: "lookup", required: true, writable: false },
              { apiName: "balance", label: "Balance", fieldType: "decimal", writable: false },
              { apiName: "updated_at", label: "Updated", fieldType: "datetime", writable: false },
            ],
          },
          {
            objectKey: "loyalty_activity",
            metadataScope: "global",
            label: "Loyalty Activity",
            pluralLabel: "Loyalty Activity",
            description: "Canonical loyalty earn, redemption, reversal and adjustment ledger.",
            sourceTable: "customer_loyalty_transactions",
            fields: [
              { apiName: "company_id", label: "Company", fieldType: "lookup", required: true, writable: false },
              { apiName: "customer_id", label: "Customer", fieldType: "lookup", required: true, writable: false },
              { apiName: "transaction_type", label: "Entry Type", fieldType: "picklist", required: true, writable: false },
              { apiName: "amount", label: "Points", fieldType: "decimal", required: true, writable: false },
              { apiName: "balance_after", label: "Balance After", fieldType: "decimal", writable: false },
              { apiName: "reference_type", label: "Reference Type", fieldType: "text", writable: false },
              { apiName: "reference_id", label: "Reference", fieldType: "lookup", writable: false },
              { apiName: "description", label: "Reason", fieldType: "text", writable: false },
              { apiName: "created_by", label: "Operator", fieldType: "lookup", writable: false },
              { apiName: "created_at", label: "Created", fieldType: "datetime", writable: false },
            ],
          },
          {
            objectKey: "loyalty_adjustment",
            metadataScope: "global",
            label: "Loyalty Adjustment",
            pluralLabel: "Loyalty Adjustments",
            description: "Auditable manual loyalty adjustments.",
            sourceTable: "customer_loyalty_adjustments",
            fields: [
              { apiName: "company_id", label: "Company", fieldType: "lookup", required: true, writable: false },
              { apiName: "customer_id", label: "Customer", fieldType: "lookup", required: true, writable: false },
              { apiName: "points", label: "Points", fieldType: "decimal", required: true, writable: false },
              { apiName: "reason", label: "Reason", fieldType: "text", writable: false },
              { apiName: "reference_id", label: "Reference", fieldType: "lookup", writable: false },
              { apiName: "created_by", label: "Operator", fieldType: "lookup", writable: false },
              { apiName: "created_at", label: "Created", fieldType: "datetime", writable: false },
            ],
          },
        ],
        relationships: [
          { parentObjectKey: "customer", childObjectKey: "loyalty_account", relationshipKey: "loyalty_account", relationshipType: "one_to_many", childFieldApiName: "customer_id" },
          { parentObjectKey: "customer", childObjectKey: "loyalty_activity", relationshipKey: "loyalty_activity", relationshipType: "one_to_many", childFieldApiName: "customer_id" },
          { parentObjectKey: "loyalty_activity", childObjectKey: "customer", relationshipKey: "customer", relationshipType: "lookup", childFieldApiName: "customer_id" },
          { parentObjectKey: "loyalty_activity", childObjectKey: "sale", relationshipKey: "sale", relationshipType: "lookup", childFieldApiName: "reference_id", referenceType: "sale" },
          { parentObjectKey: "sale", childObjectKey: "loyalty_activity", relationshipKey: "loyalty_activity", relationshipType: "one_to_many", childFieldApiName: "reference_id", referenceType: "sale" },
        ],
        permissionDeclarations: [
          { key: "view", permission: "customer.view", access: "read" },
          { key: "adjust", permission: "loyalty.adjust", access: "execute" },
          { key: "configure", permission: "settings.manage", access: "write" },
        ],
        actions: [
          {
            actionKey: "loyalty.adjust",
            objectKey: "loyalty_account",
            label: "Adjust Loyalty",
            description: "Use the existing customer loyalty adjustment route and ledger.",
            handlerKey: "CUSTOMER_LOYALTY_ADJUST",
            requiredPermission: "loyalty.adjust",
          },
        ],
        listViews: [
          { objectKey: "loyalty_account", viewKey: "all", label: "Customer Loyalty", columns: ["customer_id", "balance", "updated_at"], isDefault: true },
          { objectKey: "loyalty_activity", viewKey: "all", label: "Loyalty Activity", columns: ["customer_id", "transaction_type", "amount", "reference_type", "created_at"], isDefault: true },
        ],
        references: [
          { packageKey: "retail_pos", objectKey: "sale", purpose: "Sale reference for earning, redemption and reversal activity" },
          { packageKey: "retail_pos", objectKey: "payment", purpose: "Loyalty redemption remains a Payment Core tender" },
        ],
      } : {}),
      ...(entry.key === "uber_eats" ? {
        objects: [
          {
            objectKey: "uber_eats_connection",
            metadataScope: "global",
            label: "Uber Eats Connection",
            pluralLabel: "Uber Eats Connections",
            description: "Tenant-scoped connection status for Uber Eats. Client credentials remain in the existing integration configuration and are not exposed as Platform fields.",
            sourceTable: "integrations",
            fields: [
              { apiName: "name", label: "Connection Name", fieldType: "text", writable: false },
              { apiName: "provider", label: "Provider", fieldType: "text", required: true, writable: false },
              { apiName: "active", label: "Active", fieldType: "boolean", writable: false },
              { apiName: "created_at", label: "Created", fieldType: "datetime", writable: false },
              { apiName: "updated_at", label: "Updated", fieldType: "datetime", writable: false },
            ],
          },
        ],
        permissionDeclarations: [
          { key: "connection_status", permission: "online_orders.view", access: "read" },
          { key: "connector_actions", permission: "online_orders.configure", access: "execute" },
          { key: "order_lifecycle", permission: "online_orders.manage", access: "execute" },
        ],
        actions: [
          {
            actionKey: "uber_eats.get_stores",
            objectKey: "uber_eats_connection",
            label: "Get Uber Eats Stores",
            description: "Run the editable Uber Eats Get Stores flow.",
            handlerKey: "RUN_SUBFLOW",
            requiredPermission: "online_orders.configure",
            config: { subflowApiName: "GPT_UBER_EATS_GET_STORES" },
          },
          {
            actionKey: "uber_eats.test_connection",
            objectKey: "uber_eats_connection",
            label: "Test Uber Eats Connection",
            description: "Run the editable Uber Eats Test Connection flow.",
            handlerKey: "RUN_SUBFLOW",
            requiredPermission: "online_orders.configure",
            config: { subflowApiName: "GPT_UBER_EATS_TEST_CONNECTION" },
          },
          {
            actionKey: "uber_eats.upload_menu",
            objectKey: "uber_eats_connection",
            label: "Upload Uber Eats Menu",
            description: "Run the editable Uber Eats Upload Menu flow.",
            handlerKey: "RUN_SUBFLOW",
            requiredPermission: "online_orders.configure",
            config: { subflowApiName: "GPT_UBER_EATS_UPLOAD_MENU" },
          },
          {
            actionKey: "uber_eats.accept_order",
            objectKey: "uber_eats_connection",
            label: "Accept Uber Eats Order",
            description: "Run the editable Uber Eats Accept Order flow.",
            handlerKey: "RUN_SUBFLOW",
            requiredPermission: "online_orders.manage",
            config: { subflowApiName: "GPT_UBER_EATS_ACCEPT_ORDER" },
          },
          {
            actionKey: "uber_eats.deny_order",
            objectKey: "uber_eats_connection",
            label: "Deny Uber Eats Order",
            description: "Run the editable Uber Eats Deny Order flow.",
            handlerKey: "RUN_SUBFLOW",
            requiredPermission: "online_orders.manage",
            config: { subflowApiName: "GPT_UBER_EATS_DENY_ORDER" },
          },
          {
            actionKey: "uber_eats.update_item_price",
            objectKey: "uber_eats_connection",
            label: "Update Uber Eats Item Price",
            description: "Run the editable Uber Eats Update Item Price flow.",
            handlerKey: "RUN_SUBFLOW",
            requiredPermission: "online_orders.configure",
            config: { subflowApiName: "GPT_UBER_EATS_UPDATE_ITEM_PRICE" },
          },
          {
            actionKey: "uber_eats.set_item_unavailable",
            objectKey: "uber_eats_connection",
            label: "Set Uber Eats Item Unavailable",
            description: "Run the editable Uber Eats Set Item Unavailable flow.",
            handlerKey: "RUN_SUBFLOW",
            requiredPermission: "online_orders.configure",
            config: { subflowApiName: "GPT_UBER_EATS_SET_ITEM_UNAVAILABLE" },
          },
          {
            actionKey: "uber_eats.set_item_available",
            objectKey: "uber_eats_connection",
            label: "Set Uber Eats Item Available",
            description: "Run the editable Uber Eats Set Item Available flow.",
            handlerKey: "RUN_SUBFLOW",
            requiredPermission: "online_orders.configure",
            config: { subflowApiName: "GPT_UBER_EATS_SET_ITEM_AVAILABLE" },
          },
        ],
        buttons: [
          { buttonKey: "uber_eats_get_stores", objectKey: "uber_eats_connection", label: "Get Stores", actionKey: "uber_eats.get_stores", requiredPermission: "online_orders.configure", variant: "secondary" },
          { buttonKey: "uber_eats_test_connection", objectKey: "uber_eats_connection", label: "Test Connection", actionKey: "uber_eats.test_connection", requiredPermission: "online_orders.configure", variant: "secondary" },
          { buttonKey: "uber_eats_upload_menu", objectKey: "uber_eats_connection", label: "Upload Menu", actionKey: "uber_eats.upload_menu", requiredPermission: "online_orders.configure", variant: "primary" },
        ],
        mappingSchema: [
          {
            key: "store",
            scope: "company",
            source: "integrations.configuration.store_id",
            externalKey: "integrations.configuration.store_location_id",
            target: "stores.id",
            override: "company-selected-store",
          },
          {
            key: "product",
            scope: "company",
            source: "products.uber_item_id",
            externalKey: "Uber Eats item id",
            eligibility: "products.available_on_uber",
            override: "preserve-explicit-product-item-id",
          },
        ],
        workflows: [
          ...uberEatsWorkflowDefinitions(),
          {
            key: "uber_eats_menu_sync_after_product_save",
            label: "Uber Eats menu sync after product save",
            objectKey: "product",
            triggerKey: "after_save",
            activeByDefault: false,
            conditions: [{ field: "available_on_uber", operator: "equals", value: true }],
            action: {
              type: "workflow",
              actions: [
                {
                  id: "sync_menu",
                  key: "RUN_SUBFLOW",
                  subflowApiName: "GPT_UBER_EATS_UPLOAD_MENU",
                },
              ],
            },
          },
        ],
        forms: [
          {
            formKey: "uber_eats_connection",
            label: "Uber Eats Connection",
            permission: "online_orders.configure",
            fields: [
              { key: "environment", label: "Environment", source: "integrations.configuration.environment", editableBy: "existing-online-platform-settings" },
              { key: "client_id", label: "Client ID", source: "integrations.configuration.client_id", sensitive: true, editableBy: "existing-online-platform-settings" },
              { key: "client_secret", label: "Client Secret", source: "integrations.configuration.client_secret", sensitive: true, editableBy: "existing-online-platform-settings" },
              { key: "store_id", label: "onePOS Store", source: "integrations.configuration.store_id", editableBy: "existing-online-platform-settings" },
            ],
          },
        ],
        pages: [
          {
            pageKey: "uber_eats",
            label: "Uber Eats",
            routePath: "/app/custom/uber_eats",
            runtimeComponent: "uber_eats_settings",
            permissions: ["online_orders.view", "online_orders.configure"],
            definition: {
              presentation_mode: "landing",
              runtime_component: "uber_eats_settings",
              required_permissions: ["online_orders.view"],
              form_key: "uber_eats_connection",
              mapping_schema: [
                { key: "store", path: "integrations.configuration.store_id", external_key: "integrations.configuration.store_location_id" },
                { key: "product", path: "products.uber_item_id", eligibility: "products.available_on_uber" },
              ],
              forms: [
                { key: "environment", component_key: "picklist", source: "integrations.configuration.environment", permission: "online_orders.configure" },
                { key: "client_id", component_key: "text_input", source: "integrations.configuration.client_id", sensitive: true, permission: "online_orders.configure" },
                { key: "client_secret", component_key: "text_input", source: "integrations.configuration.client_secret", sensitive: true, permission: "online_orders.configure" },
                { key: "store_id", component_key: "lookup", source: "integrations.configuration.store_id", permission: "online_orders.configure" },
              ],
              sections: [
                { id: "uber-eats-connection", label: "Uber Eats Connection", columns: 1 },
                { id: "uber-eats-mapping", label: "Product Mapping", columns: 1 },
              ],
              components: [
                { id: "uber-eats-heading", section_id: "uber-eats-connection", component_key: "header", label: "Uber Eats" },
                { id: "uber-eats-settings", section_id: "uber-eats-connection", component_key: "text", label: "Manage credentials and store selection in the existing Online Platforms settings. Secrets are never displayed in this package page." },
                { id: "uber-eats-mapping-info", section_id: "uber-eats-mapping", component_key: "text", label: "Product availability and item IDs use the existing Product Master fields available_on_uber and uber_item_id." },
              ],
            },
          },
        ],
        listViews: [
          {
            objectKey: "uber_eats_connection",
            viewKey: "connection_status",
            label: "Connection Status",
            description: "Uber Eats connection status without exposing client credentials.",
            columns: ["name", "provider", "active", "updated_at"],
            filters: { provider: "uber" },
            isDefault: true,
          },
        ],
      } : {}),
    },
  };
}

export function packageDefinitions(catalog = packageManifestCatalog) {
  return catalog.map(packageDefinition);
}

const safeMetadataKey = (value) => typeof value === "string" && /^[a-z_][a-z0-9_]{0,99}$/.test(value);

export async function provisionPackageMetadata(db, { packageId, moduleId, companyId, manifest = {}, packageVersion = manifest.version || "1.0.0" }) {
  const objects = Array.isArray(manifest.objects) ? manifest.objects : [];
  const objectIds = new Map();

  for (const definition of objects) {
    const objectKey = definition?.objectKey || definition?.object_key || definition?.key;
    const objectCompanyId = definition.metadataScope === "global" ? null : companyId || null;
    if (!safeMetadataKey(objectKey)) throw new Error(`Invalid package object key: ${objectKey || "(missing)"}`);
    if (typeof definition.label !== "string" || !definition.label.trim()) {
      throw new Error(`Package object label is required: ${objectKey}`);
    }
    const sourceTable = definition.sourceTable || definition.source_table || null;
    const storeScoped = typeof definition.storeScoped === "boolean" ? definition.storeScoped : null;
    if (sourceTable && !safeMetadataKey(sourceTable)) throw new Error(`Invalid package source table: ${sourceTable}`);
    const existing = await db(
      "SELECT id,package_id,module_id,company_id FROM platform_objects WHERE object_key=$1",
      [objectKey]
    );
    let object;
    if (existing.rows.length) {
      object = existing.rows[0];
      if (object.package_id && object.package_id !== packageId) {
        const adoptable = Array.isArray(definition.adoptFromPackageKeys) ? definition.adoptFromPackageKeys : [];
        const owner = adoptable.length
          ? await db("SELECT package_key FROM package_registry WHERE id=$1", [object.package_id])
          : { rows: [] };
        if (!adoptable.includes(owner.rows[0]?.package_key)) {
          throw new Error(`Platform object is owned by another package: ${objectKey}`);
        }
      }
      if (!object.package_id) {
        const priorOwner = await db(
          "SELECT 1 FROM package_metadata_ownership WHERE metadata_type='object' AND metadata_id=$1 AND package_id=$2 AND managed=true",
          [object.id, packageId]
        );
        if (!priorOwner.rows.length) {
          const legacyObject = await db(
            "SELECT source_table,managed,user_modified FROM platform_objects WHERE id=$1",
            [object.id]
          );
          const row = legacyObject.rows[0] || {};
          const sameSourceTable = Boolean(sourceTable) && row.source_table === sourceTable;
          const safeLegacyAdoption = sameSourceTable && row.managed === false && row.user_modified === false;
          if (!safeLegacyAdoption) {
            throw new Error(`Package cannot take ownership of existing custom Platform object: ${objectKey}`);
          }
          await db(
            `INSERT INTO package_metadata_ownership
             (package_id,package_version,metadata_type,metadata_id,managed)
             VALUES ($1,$3,'object',$2,true)
             ON CONFLICT (package_id,metadata_type,metadata_id)
             DO UPDATE SET managed=true,package_version=EXCLUDED.package_version,updated_at=NOW()`,
            [packageId, object.id, packageVersion]
          );
        }
      }
      if (object.company_id && object.company_id !== objectCompanyId) {
        throw new Error(`Platform object belongs to another company: ${objectKey}`);
      }
      await db(
          "UPDATE platform_objects SET package_id=$1,module_id=COALESCE(module_id,$2),company_id=COALESCE(company_id,$3),label=CASE WHEN user_modified THEN label ELSE $4 END,plural_label=CASE WHEN user_modified THEN plural_label ELSE $5 END,description=CASE WHEN user_modified THEN description ELSE $6 END,source_table=CASE WHEN user_modified THEN source_table ELSE COALESCE($7,source_table) END,store_scoped=CASE WHEN user_modified OR $8::boolean IS NULL THEN store_scoped ELSE $8 END,config=CASE WHEN user_modified THEN config ELSE $9::jsonb END,source_package_version=$11,managed=true,package_required=$12,active=true,updated_at=NOW() WHERE id=$10 RETURNING *",
          [packageId, moduleId, objectCompanyId, definition.label.trim(), definition.pluralLabel || definition.plural_label || null, definition.description || null, sourceTable, storeScoped, JSON.stringify(definition.config || {}), object.id, packageVersion, definition.required === true]
      );
    } else {
      const result = await db(
        `INSERT INTO platform_objects
         (module_id,package_id,object_key,label,plural_label,description,company_id,source_table,store_scoped,config,source_package_version,managed,package_required)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,true,$12) RETURNING *`,
        [moduleId, packageId, objectKey, definition.label.trim(), definition.pluralLabel || definition.plural_label || null, definition.description || null, objectCompanyId, sourceTable, definition.storeScoped === true, JSON.stringify(definition.config || {}), packageVersion, definition.required === true]
      );
      object = result.rows[0];
    }
    objectIds.set(objectKey, object.id);

    for (const field of Array.isArray(definition.fields) ? definition.fields : []) {
      const fieldCompanyId = definition.fieldsMetadataScope === "global" || field.metadataScope === "global"
        ? null
        : companyId || null;
      const apiName = field?.apiName || field?.api_name;
      const sourceColumn = field?.sourceColumn || field?.source_column || null;
      if (!safeMetadataKey(apiName) || typeof field.label !== "string" || !field.label.trim()) {
        throw new Error(`Invalid package field on ${objectKey}`);
      }
      if (sourceColumn && !safeMetadataKey(sourceColumn)) {
        throw new Error(`Invalid package field source column on ${objectKey}.${apiName}`);
      }
      const existingField = await db(
        "SELECT id,company_id,source_package_id,source_column,field_type,managed,user_modified FROM platform_fields WHERE object_id=$1 AND api_name=$2 AND (company_id IS NULL OR company_id=$3) ORDER BY company_id NULLS FIRST LIMIT 1",
        [object.id, apiName, fieldCompanyId]
      );
      if (existingField.rows.length) {
        const existing = existingField.rows[0];
        if (existing.company_id && existing.company_id !== fieldCompanyId) {
          throw new Error(`Platform field belongs to another company: ${objectKey}.${apiName}`);
        }
        if (existing.source_package_id && existing.source_package_id !== packageId) {
          throw new Error(`Platform field is owned by another package: ${objectKey}.${apiName}`);
        }
        if (!existing.source_package_id) {
          const priorOwner = await db(
            "SELECT 1 FROM package_metadata_ownership WHERE metadata_type='field' AND metadata_id=$1 AND package_id=$2 AND managed=true",
            [existing.id, packageId]
          );
          if (!priorOwner.rows.length) {
            // Older platform bootstrap builds created canonical physical fields
            // before package ownership metadata existed. Untouched, unmanaged
            // fields that map the same API name to the same physical column are
            // legacy canonical metadata and may be adopted even when the package
            // has since tightened the metadata type (for example text -> picklist).
            // User-modified/custom mappings remain protected.
            const safeLegacyAdoption =
              existing.user_modified === false &&
              existing.managed === false &&
              Boolean(sourceColumn) &&
              existing.source_column === sourceColumn;
            if (!safeLegacyAdoption) {
              throw new Error(`Package cannot take ownership of existing custom Platform field: ${objectKey}.${apiName}`);
            }
            await db(
              `INSERT INTO package_metadata_ownership
               (package_id,package_version,metadata_type,metadata_id,managed)
               VALUES ($1,$3,'field',$2,true)
               ON CONFLICT (package_id,metadata_type,metadata_id)
               DO UPDATE SET managed=true,package_version=EXCLUDED.package_version,updated_at=NOW()`,
              [packageId, existing.id, packageVersion]
            );
          }
        }
        await db(
          "UPDATE platform_fields SET label=CASE WHEN user_modified THEN label ELSE $1 END,field_type=CASE WHEN user_modified THEN field_type ELSE $2 END,source_column=CASE WHEN user_modified THEN source_column ELSE $3 END,required=$4,readable=CASE WHEN user_modified THEN readable ELSE $5 END,writable=CASE WHEN user_modified THEN writable ELSE $6 END,options=CASE WHEN user_modified THEN options ELSE $7::jsonb END,config=CASE WHEN user_modified THEN config ELSE $8::jsonb END,display_order=$9,company_id=COALESCE(company_id,$10),source_package_id=$12,source_package_version=$13,managed=true,package_required=$14,active=true WHERE id=$11",
          [field.label.trim(), field.fieldType || field.field_type || "text", sourceColumn, field.required === true, field.readable !== false, field.writable === true, JSON.stringify(field.options || []), JSON.stringify({ ...(field.config || {}), packageContract: field.required === true ? "required" : "default", packageOwned: true, packageId }), Number(field.displayOrder ?? field.display_order ?? 0), fieldCompanyId, existingField.rows[0].id, packageId, packageVersion, field.required === true]
        );
      } else {
        await db(
          `INSERT INTO platform_fields
           (object_id,api_name,label,field_type,source_column,required,readable,writable,options,config,display_order,company_id,source_package_id,source_package_version,managed,package_required)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13,$14,true,$15)`,
          [object.id, apiName, field.label.trim(), field.fieldType || field.field_type || "text", field.sourceColumn || field.source_column || null, field.required === true, field.readable !== false, field.writable === true, JSON.stringify(field.options || []), JSON.stringify({ ...(field.config || {}), packageContract: field.required === true ? "required" : "default", packageOwned: true, packageId }), Number(field.displayOrder ?? field.display_order ?? 0), fieldCompanyId, packageId, packageVersion, field.required === true]
        );
      }
    }
  }

  const layouts = [
    ...(Array.isArray(manifest.layouts) ? manifest.layouts : []),
    ...(Array.isArray(manifest.recordForms) ? manifest.recordForms.map((form) => ({
      ...form,
      layoutKey: form.layoutKey || form.layout_key || form.formKey || form.form_key,
    })) : []),
  ];
  for (const layout of layouts) {
    const objectId = objectIds.get(layout.objectKey || layout.object_key);
    const layoutKey = layout.layoutKey || layout.layout_key;
    const pageType = layout.pageType || layout.page_type;
    if (!objectId || !safeMetadataKey(layoutKey) || !["list", "detail", "view", "create", "edit", "quick_create"].includes(pageType) ||
        typeof layout.name !== "string" || !layout.name.trim() || !layout.definition || !Array.isArray(layout.definition.components)) {
      throw new Error("Package layouts and forms require an object, safe key, supported page type, name and component definition");
    }
    await db(
      `INSERT INTO platform_layouts
       (object_id,page_type,company_id,name,layout_key,definition,active,is_default,source_package_id,source_package_version,managed,package_required)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,true,$7,$8,$9,true,$10)
       ON CONFLICT (object_id,page_type,layout_key) WHERE layout_key <> ''
       DO UPDATE SET company_id=EXCLUDED.company_id,name=EXCLUDED.name,definition=EXCLUDED.definition,
         active=true,is_default=EXCLUDED.is_default,source_package_id=EXCLUDED.source_package_id,
         source_package_version=EXCLUDED.source_package_version,managed=true,package_required=EXCLUDED.package_required,updated_at=NOW()
       WHERE platform_layouts.user_modified=false
          OR platform_layouts.source_package_id=EXCLUDED.source_package_id`,
      [objectId, pageType, layout.metadataScope === "global" ? null : companyId || null, layout.name.trim(), layoutKey,
        JSON.stringify(layout.definition), layout.isDefault === true, packageId, packageVersion, layout.required === true]
    );
  }

  for (const relationship of Array.isArray(manifest.relationships) ? manifest.relationships : []) {
    const parentKey = relationship.parentObjectKey || relationship.parent_object_key;
    const childKey = relationship.childObjectKey || relationship.child_object_key;
    let parentObjectId = objectIds.get(parentKey);
    let childObjectId = objectIds.get(childKey);
    if (!parentObjectId || !childObjectId) {
      const external = await db(
        "SELECT id,object_key FROM platform_objects WHERE object_key=ANY($1::text[]) AND (company_id IS NULL OR company_id=$2)",
        [[parentKey, childKey], companyId]
      );
      const byKey = new Map(external.rows.map((row) => [row.object_key, row.id]));
      parentObjectId ||= byKey.get(parentKey);
      childObjectId ||= byKey.get(childKey);
    }
    if (!parentObjectId || !childObjectId || !safeMetadataKey(relationship.relationshipKey || relationship.relationship_key)) {
      throw new Error("Package relationships must reference declared objects with safe keys");
    }
    let childFieldId = null;
    const childFieldKey = relationship.childFieldApiName || relationship.child_field_api_name;
    if (childFieldKey) {
      const relationshipType = relationship.relationshipType || relationship.relationship_type || "lookup";
      const fieldObjectId = relationshipType === "lookup" ? parentObjectId : childObjectId;
      const fieldResult = await db(
        "SELECT id FROM platform_fields WHERE object_id=$1 AND api_name=$2 AND (company_id IS NULL OR company_id=$3) LIMIT 1",
        [fieldObjectId, childFieldKey, companyId]
      );
      if (!fieldResult.rows[0]?.id) throw new Error(`Package relationship field not found: ${childFieldKey}`);
      if (relationshipType !== "lookup") childFieldId = fieldResult.rows[0].id;
    }
    const parentFieldKey = relationship.parentFieldApiName || relationship.parent_field_api_name;
    const relationshipType = relationship.relationshipType || relationship.relationship_type || "lookup";
    if (relationshipType === "lookup" && parentFieldKey) {
      const parentFieldResult = await db(
        "SELECT id FROM platform_fields WHERE object_id=$1 AND api_name=$2 AND (company_id IS NULL OR company_id=$3) LIMIT 1",
        [parentObjectId, parentFieldKey, companyId]
      );
      if (!parentFieldResult.rows.length) throw new Error(`Package relationship field not found: ${parentFieldKey}`);
    }
    const relationshipKey = relationship.relationshipKey || relationship.relationship_key;
    const declaredRelationshipType = relationship.relationshipType || relationship.relationship_type || "lookup";
    const existingRelationship = await db(
      `SELECT id,child_object_id,relationship_type,child_field_id,source_package_id,managed,user_modified
         FROM platform_relationships
        WHERE parent_object_id=$1 AND relationship_key=$2
        LIMIT 1`,
      [parentObjectId, relationshipKey]
    );
    if (existingRelationship.rows.length) {
      const existing = existingRelationship.rows[0];
      if (existing.source_package_id && existing.source_package_id !== packageId) {
        throw new Error(`Package relationship key is owned by another declaration: ${relationshipKey}`);
      }
      if (!existing.source_package_id) {
        const sameChild = String(existing.child_object_id || "") === String(childObjectId || "");
        const sameType = String(existing.relationship_type || "") === String(declaredRelationshipType || "");
        const sameField = String(existing.child_field_id || "") === String(childFieldId || "");
        const safeLegacyAdoption =
          existing.user_modified === false &&
          existing.managed === false &&
          sameChild &&
          sameType &&
          sameField;
        if (!safeLegacyAdoption) {
          throw new Error(`Package relationship key is owned by another declaration: ${relationshipKey}`);
        }
        await db(
          `UPDATE platform_relationships
              SET source_package_id=$1,source_package_version=$2,managed=true,
                  package_required=$3,active=true
            WHERE id=$4`,
          [packageId, packageVersion, relationship.required === true, existing.id]
        );
        await db(
          `INSERT INTO package_metadata_ownership
             (package_id,package_version,metadata_type,metadata_id,managed,package_required,user_modified,default_snapshot)
           VALUES ($1,$2,'relationship',$3,true,$4,false,$5::jsonb)
           ON CONFLICT (package_id,metadata_type,metadata_id)
           DO UPDATE SET package_version=EXCLUDED.package_version,managed=true,
                         package_required=EXCLUDED.package_required,user_modified=false,
                         default_snapshot=EXCLUDED.default_snapshot,updated_at=NOW()`,
          [
            packageId,
            packageVersion,
            existing.id,
            relationship.required === true,
            JSON.stringify({
              parentObjectId,
              childObjectId,
              relationshipKey,
              relationshipType: declaredRelationshipType,
              childFieldId,
            }),
          ]
        );
      }
    }

    const registeredRelationship = await db(
      `INSERT INTO platform_relationships
       (parent_object_id,child_object_id,relationship_key,relationship_type,child_field_id,active,source_package_id,source_package_version,managed,package_required)
       VALUES ($1,$2,$3,$4,$5,true,$6,$7,true,$8)
       ON CONFLICT (parent_object_id,relationship_key)
       DO UPDATE SET child_object_id=EXCLUDED.child_object_id,relationship_type=EXCLUDED.relationship_type,child_field_id=EXCLUDED.child_field_id,
                     source_package_id=EXCLUDED.source_package_id,source_package_version=EXCLUDED.source_package_version,
                     managed=true,package_required=EXCLUDED.package_required,active=true
       WHERE platform_relationships.source_package_id=EXCLUDED.source_package_id
       RETURNING id`,
      [parentObjectId, childObjectId, relationshipKey, declaredRelationshipType, childFieldId, packageId, packageVersion, relationship.required === true]
    );
    if (!registeredRelationship.rows?.length && registeredRelationship.rowCount === 0) {
      throw new Error(`Package relationship key is owned by another declaration: ${relationship.relationshipKey || relationship.relationship_key}`);
    }
  }

  for (const view of Array.isArray(manifest.listViews) ? manifest.listViews : []) {
    const objectId = objectIds.get(view.objectKey || view.object_key);
    if (!objectId || !safeMetadataKey(view.viewKey || view.view_key)) {
      throw new Error("Package list views must reference declared objects with safe keys");
    }
    const registeredView = await db(
      `INSERT INTO platform_list_views
       (object_id,company_id,view_key,label,description,columns,filters,filter_model,sort,page_size,is_default,
        source_package_id,source_package_version,managed,package_required)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10,$11,$12,$13,true,$14)
       ON CONFLICT (object_id,company_id,view_key)
       DO UPDATE SET label=CASE WHEN platform_list_views.user_modified THEN platform_list_views.label ELSE EXCLUDED.label END,
         description=CASE WHEN platform_list_views.user_modified THEN platform_list_views.description ELSE EXCLUDED.description END,
         columns=CASE WHEN platform_list_views.user_modified THEN platform_list_views.columns ELSE EXCLUDED.columns END,
         filters=CASE WHEN platform_list_views.user_modified THEN platform_list_views.filters ELSE EXCLUDED.filters END,
         filter_model=CASE WHEN platform_list_views.user_modified THEN platform_list_views.filter_model ELSE EXCLUDED.filter_model END,
         sort=CASE WHEN platform_list_views.user_modified THEN platform_list_views.sort ELSE EXCLUDED.sort END,
         page_size=CASE WHEN platform_list_views.user_modified THEN platform_list_views.page_size ELSE EXCLUDED.page_size END,
         is_default=CASE WHEN platform_list_views.user_modified THEN platform_list_views.is_default ELSE EXCLUDED.is_default END,
         source_package_version=EXCLUDED.source_package_version,managed=true,package_required=EXCLUDED.package_required,
         active=CASE WHEN platform_list_views.user_modified THEN platform_list_views.active ELSE true END,
         updated_at=NOW()
       WHERE platform_list_views.source_package_id=EXCLUDED.source_package_id
       RETURNING id`,
      [
        objectId,
        companyId || null,
        view.viewKey || view.view_key,
        view.label,
        view.description || null,
        JSON.stringify(view.columns || []),
        JSON.stringify(view.filters || {}),
        JSON.stringify(view.filterModel || view.filter_model || {}),
        JSON.stringify(view.sort || { field: null, direction: "asc" }),
        Number.isFinite(Number(view.pageSize)) ? Number(view.pageSize) : 50,
        view.isDefault === true,
        packageId,
        packageVersion,
        view.required === true,
      ]
    );
    if (!registeredView.rows?.length && registeredView.rowCount === 0) {
      throw new Error(`Package list view is owned by another declaration: ${view.viewKey || view.view_key}`);
    }
  }

  for (const page of Array.isArray(manifest.pages) ? manifest.pages : []) {
    const pageKey = page.pageKey || page.page_key;
    if (!safeMetadataKey(pageKey) || typeof page.label !== "string" || !page.label.trim()) {
      throw new Error("Package pages require a safe page key and label");
    }
    const appKey = `package_${String(packageId).replace(/-/g, "_")}`.slice(0, 100);
    const appResult = await db(
      `INSERT INTO platform_apps
       (company_id,app_key,label,description,active,source_package_id,source_package_version,managed,package_required)
       VALUES ($1,$2,$3,$4,true,$5,$6,true,$7)
       ON CONFLICT (company_id,app_key) DO UPDATE SET
         label=CASE WHEN platform_apps.user_modified THEN platform_apps.label ELSE EXCLUDED.label END,
         description=CASE WHEN platform_apps.user_modified THEN platform_apps.description ELSE EXCLUDED.description END,
         source_package_version=EXCLUDED.source_package_version,managed=true,
         package_required=EXCLUDED.package_required,
         active=CASE WHEN platform_apps.user_modified THEN platform_apps.active ELSE true END,
         updated_at=NOW()
       WHERE platform_apps.source_package_id=EXCLUDED.source_package_id
       RETURNING id`,
      [companyId || null, appKey, page.appLabel || page.label, page.description || null,
        packageId, packageVersion, page.required === true]
    );
    if (!appResult.rows.length) throw new Error(`Package page app key is owned by another declaration: ${appKey}`);
    await db(
      `INSERT INTO platform_pages
       (app_id,company_id,page_key,label,route_path,page_type,definition,active,
        source_package_id,source_package_version,managed,package_required)
       VALUES ($1,$2,$3,$4,$5,'page',$6::jsonb,true,$7,$8,true,$9)
       ON CONFLICT (app_id,company_id,page_key) DO UPDATE SET
         label=CASE WHEN platform_pages.user_modified THEN platform_pages.label ELSE EXCLUDED.label END,
         route_path=CASE WHEN platform_pages.user_modified THEN platform_pages.route_path ELSE EXCLUDED.route_path END,
         definition=CASE WHEN platform_pages.user_modified THEN platform_pages.definition ELSE EXCLUDED.definition END,
         active=CASE WHEN platform_pages.user_modified THEN platform_pages.active ELSE true END,
         source_package_version=EXCLUDED.source_package_version,managed=true,
         package_required=EXCLUDED.package_required,updated_at=NOW()
       WHERE platform_pages.source_package_id=EXCLUDED.source_package_id`,
      [appResult.rows[0].id, companyId || null, pageKey, page.label.trim(),
        page.routePath || `/app/custom/${pageKey}`,
        JSON.stringify({ ...(page.definition || { presentation_mode: "landing", runtime_component: page.runtimeComponent || page.runtime_component || null, components: [] }), packageId }),
        packageId, packageVersion, page.required === true]
    );
  }

  for (const action of Array.isArray(manifest.actions) ? manifest.actions : []) {
    const objectId = objectIds.get(action.objectKey || action.object_key) || objectIds.values().next().value || null;
    const actionKey = action.actionKey || action.action_key;
    const handlerKey = action.handlerKey || action.handler_key;
    if (!objectId || !safeMetadataKey(String(actionKey || "").replace(/\./g, "_")) || !/^[A-Z][A-Z0-9_]{0,139}$/.test(handlerKey || "") || typeof action.label !== "string" || !action.label.trim()) {
      throw new Error("Package actions require a declared object, safe action key, registered handler key and label");
    }
    const registered = await db(
      `INSERT INTO platform_registered_actions
       (company_id,object_id,action_key,label,description,handler_key,required_permission,config,active,
        source_package_id,source_package_version,managed,package_required)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,true,$9,$10,true,$11)
       ${companyId ? "ON CONFLICT (company_id,action_key) WHERE company_id IS NOT NULL" : "ON CONFLICT (action_key) WHERE company_id IS NULL"}
       DO UPDATE SET
         object_id=CASE WHEN platform_registered_actions.user_modified THEN platform_registered_actions.object_id ELSE EXCLUDED.object_id END,
         label=CASE WHEN platform_registered_actions.user_modified THEN platform_registered_actions.label ELSE EXCLUDED.label END,
         description=CASE WHEN platform_registered_actions.user_modified THEN platform_registered_actions.description ELSE EXCLUDED.description END,
         handler_key=CASE WHEN platform_registered_actions.user_modified THEN platform_registered_actions.handler_key ELSE EXCLUDED.handler_key END,
         required_permission=CASE WHEN platform_registered_actions.user_modified THEN platform_registered_actions.required_permission ELSE EXCLUDED.required_permission END,
         config=CASE WHEN platform_registered_actions.user_modified THEN platform_registered_actions.config ELSE COALESCE(platform_registered_actions.config,'{}'::jsonb) || EXCLUDED.config END,
         active=CASE WHEN platform_registered_actions.user_modified THEN platform_registered_actions.active ELSE true END,
         source_package_version=EXCLUDED.source_package_version,managed=true,
         package_required=EXCLUDED.package_required,updated_at=NOW()
       WHERE platform_registered_actions.config->>'packageOwned'='true'
         AND platform_registered_actions.config->>'packageId'=EXCLUDED.config->>'packageId'
       RETURNING id`,
      [companyId || null, objectId, actionKey, action.label.trim(), action.description || null,
        handlerKey, action.requiredPermission || action.required_permission || null,
        JSON.stringify({ ...(action.config || {}), packageOwned: true, packageId }), packageId, packageVersion,
        action.required === true]
    );
    if (!registered.rows.length) throw new Error(`Package action key is owned by another declaration: ${actionKey}`);
  }

  for (const button of Array.isArray(manifest.buttons) ? manifest.buttons : []) {
    const objectKey = button.objectKey || button.object_key;
    let objectId = objectIds.get(objectKey);
    if (!objectId && objectKey) {
      const external = await db(
        "SELECT id FROM platform_objects WHERE object_key=$1 AND (company_id IS NULL OR company_id=$2) LIMIT 1",
        [objectKey, companyId]
      );
      objectId = external.rows[0]?.id || null;
    }
    const buttonKey = button.buttonKey || button.button_key;
    const targetType = String(button.targetType || button.target_type || "action").toLowerCase();
    const actionKey = button.actionKey || button.action_key || null;
    const targetKey = button.targetKey || button.target_key || actionKey;
    if (!objectId || !safeMetadataKey(buttonKey) || typeof button.label !== "string" || !button.label.trim() ||
        !["action", "workflow"].includes(targetType) || !targetKey) {
      throw new Error("Package buttons require an available object, safe key, label and action/workflow target");
    }
    const registered = await db(
      `INSERT INTO platform_buttons
       (company_id,object_id,button_key,label,action_key,placement,visibility_rule,config,active,target_type,target_key,variant,required_permission,input_mappings,
        source_package_id,source_package_version,managed,package_required)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,true,$9,$10,$11,$12,$13::jsonb,$14,$15,true,$16)
       ${companyId ? "ON CONFLICT (company_id,button_key) WHERE company_id IS NOT NULL" : "ON CONFLICT (button_key) WHERE company_id IS NULL"}
       DO UPDATE SET
         object_id=CASE WHEN platform_buttons.user_modified THEN platform_buttons.object_id ELSE EXCLUDED.object_id END,
         label=CASE WHEN platform_buttons.user_modified THEN platform_buttons.label ELSE EXCLUDED.label END,
         action_key=CASE WHEN platform_buttons.user_modified THEN platform_buttons.action_key ELSE EXCLUDED.action_key END,
         placement=CASE WHEN platform_buttons.user_modified THEN platform_buttons.placement ELSE EXCLUDED.placement END,
         visibility_rule=CASE WHEN platform_buttons.user_modified THEN platform_buttons.visibility_rule ELSE EXCLUDED.visibility_rule END,
         config=CASE WHEN platform_buttons.user_modified THEN platform_buttons.config ELSE COALESCE(platform_buttons.config,'{}'::jsonb) || EXCLUDED.config END,
         active=CASE WHEN platform_buttons.user_modified THEN platform_buttons.active ELSE true END,
         target_type=CASE WHEN platform_buttons.user_modified THEN platform_buttons.target_type ELSE EXCLUDED.target_type END,
         target_key=CASE WHEN platform_buttons.user_modified THEN platform_buttons.target_key ELSE EXCLUDED.target_key END,
         variant=CASE WHEN platform_buttons.user_modified THEN platform_buttons.variant ELSE EXCLUDED.variant END,
         required_permission=CASE WHEN platform_buttons.user_modified THEN platform_buttons.required_permission ELSE EXCLUDED.required_permission END,
         input_mappings=CASE WHEN platform_buttons.user_modified THEN platform_buttons.input_mappings ELSE EXCLUDED.input_mappings END,
         source_package_version=EXCLUDED.source_package_version,managed=true,
         package_required=EXCLUDED.package_required,updated_at=NOW()
       WHERE platform_buttons.config->>'packageOwned'='true'
         AND platform_buttons.config->>'packageId'=EXCLUDED.config->>'packageId'
       RETURNING id`,
      [companyId || null, objectId, buttonKey, button.label.trim(), actionKey || targetKey,
        button.placement || "record", JSON.stringify(button.visibilityRule || button.visibility_rule || {}),
        JSON.stringify({ packageOwned: true, packageId, ...(button.config || {}) }),
        targetType, targetKey, button.variant || "primary",
        button.requiredPermission || button.required_permission || null,
        JSON.stringify(button.inputMappings || button.input_mappings || {}),
        packageId, packageVersion, button.required === true]
    );
    if (!registered.rows.length) throw new Error(`Package button key is owned by another declaration: ${buttonKey}`);
  }

  const packageRules = [
    ...(Array.isArray(manifest.rules) ? manifest.rules : []),
    ...(Array.isArray(manifest.workflows) ? manifest.workflows.map((workflow) => ({
      ...workflow,
      name: workflow.name || workflow.label,
      action: {
        ...(workflow.action || {}),
        type: "workflow",
        match: workflow.match || workflow.action?.match || "all",
        scope: workflow.scope || workflow.action?.scope || null,
        channel: workflow.channel || workflow.action?.channel || null,
        actions: workflow.actions || workflow.action?.actions || [],
      },
    })) : []),
  ];
  for (const rule of packageRules) {
    const objectKey = rule.objectKey || rule.object_key;
    let objectId = objectIds.get(objectKey);
    if (!objectId) {
      const external = await db(
        "SELECT id FROM platform_objects WHERE object_key=$1 AND (company_id IS NULL OR company_id=$2) LIMIT 1",
        [objectKey, companyId]
      );
      objectId = external.rows[0]?.id;
    }

    // Workflows may legitimately target an object owned by a required
    // dependency (for example WhatsApp Assistant -> Communication Core's
    // communication_event). Installation is idempotent, so if the shared
    // object is not present yet, provision the dependency that declares it
    // and resolve the object again before rejecting the package.
    if (!objectId && objectKey && Array.isArray(manifest.dependencies)) {
      const dependencyKeys = manifest.dependencies
        .map((dependency) => typeof dependency === "string" ? dependency : dependency?.packageKey || dependency?.package_key)
        .filter(Boolean);
      if (dependencyKeys.length) {
        const dependencies = await db(
          `SELECT p.id,p.package_key,p.version,p.manifest,p.module_id
             FROM package_registry p
            WHERE p.package_key=ANY($1::text[]) AND p.active=true`,
          [dependencyKeys]
        );
        const owner = (dependencies.rows || []).find((dependency) =>
          Array.isArray(dependency.manifest?.objects)
          && dependency.manifest.objects.some((definition) =>
            (definition?.objectKey || definition?.object_key || definition?.key) === objectKey
          )
        );
        if (owner?.id && owner?.module_id) {
          await provisionPackageMetadata(db, {
            packageId: owner.id,
            moduleId: owner.module_id,
            companyId,
            manifest: owner.manifest || {},
            packageVersion: owner.version || owner.manifest?.version || "1.0.0",
          });
          const resolved = await db(
            "SELECT id FROM platform_objects WHERE object_key=$1 AND (company_id IS NULL OR company_id=$2) LIMIT 1",
            [objectKey, companyId]
          );
          objectId = resolved.rows[0]?.id;
        }
      }
    }

    if (!objectId) {
      throw new Error(`Package rule "${rule.name || "(unnamed)"}" references unavailable object "${objectKey || "(missing)"}"`);
    }
    if (typeof rule.name !== "string" || !rule.name.trim()) {
      throw new Error("Package rules require a name");
    }
    if (!safeMetadataKey(rule.triggerKey || rule.trigger_key)) {
      throw new Error(`Package rule "${rule.name}" has an invalid trigger key`);
    }
    // Package manifests are the authority for whether their managed rules/workflows
    // are active. Previously only validation rules and KIOSK_EXPERIENCE workflows
    // could ever become active, which silently disabled communication/appointment
    // workflows even when a package explicitly declared active: true.
    const packageRuleActive = rule.active === true;
    const packageRuleLifecycle = packageRuleActive
      ? "ACTIVE"
      : String(rule.lifecycleStatus || rule.lifecycle_status || "INACTIVE").toUpperCase() === "ACTIVE" && rule.active === true
        ? "ACTIVE"
        : "INACTIVE";

    const existingRule = await db(
      "SELECT id,action,source_package_id,user_modified FROM platform_rules WHERE object_id=$1 AND company_id IS NOT DISTINCT FROM $2 AND name=$3 LIMIT 1",
      [objectId, companyId || null, rule.name.trim()]
    );
    const ruleAction = { ...(rule.action || {}), packageKey: manifest.packageKey || rule.packageKey };
    if (existingRule.rows.length) {
      if (existingRule.rows[0].source_package_id !== packageId) {
        throw new Error(`Package workflow name is owned by another declaration: ${rule.name}`);
      }
      if (existingRule.rows[0].user_modified) continue;
      await db(
        `UPDATE platform_rules
            SET trigger_key=CASE WHEN user_modified THEN trigger_key ELSE $1 END,
                conditions=CASE WHEN user_modified THEN conditions ELSE $2::jsonb END,
                action=CASE WHEN user_modified THEN action ELSE $3::jsonb END,
                active=CASE WHEN user_modified THEN active ELSE $4 END,
                lifecycle_status=CASE WHEN user_modified THEN lifecycle_status ELSE $5 END,
                source_package_version=$6,managed=true,package_required=$7,
                updated_at=NOW()
          WHERE id=$8 AND source_package_id=$9`,
        [rule.triggerKey || rule.trigger_key, JSON.stringify(rule.conditions || []), JSON.stringify(ruleAction),
          packageRuleActive,
          packageRuleLifecycle,
          packageVersion, rule.required === true, existingRule.rows[0].id, packageId]
      );
      continue;
    }
    await db(
      `INSERT INTO platform_rules
       (object_id,name,trigger_key,conditions,action,active,company_id,lifecycle_status,source_package_id,source_package_version,managed,package_required)
       VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8,$9,$10,true,$11)`,
      [
        objectId,
        rule.name.trim(),
        rule.triggerKey || rule.trigger_key,
        JSON.stringify(rule.conditions || []),
        JSON.stringify(ruleAction),
        packageRuleActive,
        companyId || null,
        packageRuleLifecycle,
        packageId,
        packageVersion,
        rule.required === true,
      ]
    );
  }

  const forms = [
    ...(Array.isArray(manifest.forms) ? manifest.forms.filter((form) =>
      (form.objectKey || form.object_key) && form.definition && typeof form.definition === "object"
    ).map((form) => ({
      ...form,
      pageType: form.pageType || form.page_type || "edit",
    })) : []),
  ];
  for (const layout of forms) {
    const objectId = objectIds.get(layout.objectKey || layout.object_key);
    const pageType = layout.pageType || layout.page_type;
    const layoutKey = layout.layoutKey || layout.layout_key || layout.name;
    if (!objectId || !["list", "detail", "view", "create", "edit", "quick_create"].includes(pageType) ||
        !safeMetadataKey(String(layoutKey || "").replace(/-/g, "_")) ||
        typeof layout.name !== "string" || !layout.name.trim() ||
        !layout.definition || typeof layout.definition !== "object") {
      throw new Error("Package forms and layouts require a declared object, safe key, name, page type, and definition");
    }
    const registered = await db(
      `INSERT INTO platform_layouts
       (object_id,page_type,company_id,name,layout_key,definition,active,is_default,
        source_package_id,source_package_version,managed,package_required)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,true,$7,$8,$9,true,$10)
       ON CONFLICT (object_id,page_type,layout_key) WHERE layout_key <> ''
       DO UPDATE SET name=CASE WHEN platform_layouts.user_modified THEN platform_layouts.name ELSE EXCLUDED.name END,
         layout_key=EXCLUDED.layout_key,
         definition=CASE WHEN platform_layouts.user_modified THEN platform_layouts.definition ELSE EXCLUDED.definition END,
         active=CASE WHEN platform_layouts.user_modified THEN platform_layouts.active ELSE true END,
         is_default=CASE WHEN platform_layouts.user_modified THEN platform_layouts.is_default ELSE EXCLUDED.is_default END,
         source_package_version=EXCLUDED.source_package_version,managed=true,
         package_required=EXCLUDED.package_required
       WHERE platform_layouts.source_package_id=EXCLUDED.source_package_id
       RETURNING id`,
      [objectId, pageType, companyId || null, layout.name.trim(), layoutKey,
        JSON.stringify(layout.definition), layout.isDefault === true, packageId,
        packageVersion, layout.required === true]
    );
    if (!registered.rows?.length && registered.rowCount === 0) {
      throw new Error(`Package layout is owned by another declaration: ${layoutKey}`);
    }
  }

  for (const report of Array.isArray(manifest.reports) ? manifest.reports : []) {
    const objectId = objectIds.get(report.objectKey || report.object_key);
    const reportKey = report.reportKey || report.report_key;
    if (!objectId || !safeMetadataKey(reportKey) || typeof report.label !== "string" || !report.label.trim()) {
      throw new Error("Package reports require a declared object, safe report key, and label");
    }
    const registered = await db(
      `INSERT INTO platform_reports
       (object_id,company_id,report_key,label,description,config,active,source_package_id,
        source_package_version,managed,package_required)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,true,$7,$8,true,$9)
       ON CONFLICT (object_id,company_id,report_key)
       DO UPDATE SET label=CASE WHEN platform_reports.user_modified THEN platform_reports.label ELSE EXCLUDED.label END,
         description=CASE WHEN platform_reports.user_modified THEN platform_reports.description ELSE EXCLUDED.description END,
         config=CASE WHEN platform_reports.user_modified THEN platform_reports.config ELSE EXCLUDED.config END,
         active=CASE WHEN platform_reports.user_modified THEN platform_reports.active ELSE true END,
         source_package_version=EXCLUDED.source_package_version,managed=true,
         package_required=EXCLUDED.package_required
       WHERE platform_reports.source_package_id=EXCLUDED.source_package_id
       RETURNING id`,
      [objectId, companyId || null, reportKey, report.label.trim(), report.description || null,
        JSON.stringify(report.config || {}), packageId, packageVersion, report.required === true]
    );
    if (!registered.rows?.length && registered.rowCount === 0) {
      throw new Error(`Package report is owned by another declaration: ${reportKey}`);
    }
  }

  for (const connector of Array.isArray(manifest.connectors) ? manifest.connectors : []) {
    const connectorKey = connector.connectorKey || connector.connector_key;
    const baseUrl = connector.baseUrl || connector.base_url;
    let parsedUrl;
    try { parsedUrl = new URL(baseUrl); } catch { parsedUrl = null; }
    if (!safeMetadataKey(String(connectorKey || "").replace(/[.-]/g, "_")) ||
        typeof connector.name !== "string" || !connector.name.trim() ||
        !parsedUrl || !["http:", "https:"].includes(parsedUrl.protocol)) {
      throw new Error("Package connectors require a safe key, name, and HTTP(S) base URL");
    }
    const registered = await db(
      `INSERT INTO platform_connector_definitions
       (connector_key,name,description,publisher,auth_type,base_url,credentials_schema,operations,
        timeout_ms,retry_policy,status,source_package_id,source_package_version,managed,package_required)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10::jsonb,'ACTIVE',$11,$12,true,$13)
       ON CONFLICT(connector_key)
       DO UPDATE SET name=CASE WHEN platform_connector_definitions.user_modified THEN platform_connector_definitions.name ELSE EXCLUDED.name END,
         description=CASE WHEN platform_connector_definitions.user_modified THEN platform_connector_definitions.description ELSE EXCLUDED.description END,
         auth_type=CASE WHEN platform_connector_definitions.user_modified THEN platform_connector_definitions.auth_type ELSE EXCLUDED.auth_type END,
         base_url=CASE WHEN platform_connector_definitions.user_modified THEN platform_connector_definitions.base_url ELSE EXCLUDED.base_url END,
         credentials_schema=CASE WHEN platform_connector_definitions.user_modified THEN platform_connector_definitions.credentials_schema ELSE EXCLUDED.credentials_schema END,
         operations=CASE WHEN platform_connector_definitions.user_modified THEN platform_connector_definitions.operations ELSE EXCLUDED.operations END,
         source_package_version=EXCLUDED.source_package_version,managed=true,
         package_required=EXCLUDED.package_required,updated_at=NOW()
       WHERE platform_connector_definitions.source_package_id=EXCLUDED.source_package_id
       RETURNING id`,
      [connectorKey, connector.name.trim(), connector.description || null, connector.publisher || null,
        connector.authType || connector.auth_type || "none", parsedUrl.toString(),
        JSON.stringify(connector.credentialsSchema || connector.credentials_schema || []),
        JSON.stringify(connector.operations || []),
        Number.isInteger(connector.timeoutMs || connector.timeout_ms) ? (connector.timeoutMs || connector.timeout_ms) : 15000,
        JSON.stringify(connector.retryPolicy || connector.retry_policy || { maxAttempts: 3, backoffMs: 1000 }),
        packageId, packageVersion, connector.required === true]
    );
    if (!registered.rows?.length && registered.rowCount === 0) {
      throw new Error(`Package connector is owned by another declaration: ${connectorKey}`);
    }
  }

  if (Array.isArray(manifest.templates) && manifest.templates.length && !companyId) {
    throw new Error("Package message templates require a company installation scope");
  }
  for (const template of Array.isArray(manifest.templates) ? manifest.templates : []) {
    const apiKey = template.apiKey || template.api_key || template.templateKey || template.template_key;
    const channel = String(template.channel || "").toUpperCase();
    if (!safeMetadataKey(apiKey) || typeof template.name !== "string" || !template.name.trim() ||
        !["EMAIL", "SMS", "WHATSAPP"].includes(channel) || typeof template.body !== "string" || !template.body.trim()) {
      throw new Error("Package templates require a safe key, name, supported channel, and body");
    }
    const registered = await db(
      `INSERT INTO platform_message_templates
       (company_id,name,api_key,description,channel,subject,body,active,created_by,
        source_package_id,source_package_version,managed,package_required)
       VALUES ($1,$2,$3,$4,$5,$6,$7,true,NULL,$8,$9,true,$10)
       ON CONFLICT(company_id,api_key)
       DO UPDATE SET name=CASE WHEN platform_message_templates.user_modified THEN platform_message_templates.name ELSE EXCLUDED.name END,
         description=CASE WHEN platform_message_templates.user_modified THEN platform_message_templates.description ELSE EXCLUDED.description END,
         channel=CASE WHEN platform_message_templates.user_modified THEN platform_message_templates.channel ELSE EXCLUDED.channel END,
         subject=CASE WHEN platform_message_templates.user_modified THEN platform_message_templates.subject ELSE EXCLUDED.subject END,
         body=CASE WHEN platform_message_templates.user_modified THEN platform_message_templates.body ELSE EXCLUDED.body END,
         active=CASE WHEN platform_message_templates.user_modified THEN platform_message_templates.active ELSE true END,
         source_package_version=EXCLUDED.source_package_version,managed=true,
         package_required=EXCLUDED.package_required,updated_at=NOW()
       WHERE platform_message_templates.source_package_id=EXCLUDED.source_package_id
       RETURNING id`,
      [companyId, template.name.trim(), apiKey, template.description || null, channel,
        template.subject || null, template.body, packageId, packageVersion,
        template.required === true]
    );
    if (!registered.rows?.length && registered.rowCount === 0) {
      throw new Error(`Package template key is owned by another declaration: ${apiKey}`);
    }
  }

  for (const permission of Array.isArray(manifest.objectPermissions) ? manifest.objectPermissions : []) {
    const objectId = objectIds.get(permission.objectKey || permission.object_key);
    const roleId = permission.roleId || permission.role_id;
    if (!objectId || !roleId || !companyId) {
      throw new Error("Package object permissions require a declared object, role, and company scope");
    }
    const role = await db("SELECT id FROM roles WHERE id=$1 AND company_id=$2", [roleId, companyId]);
    if (!role.rows.length) throw new Error(`Package permission role is not available: ${roleId}`);
    const registered = await db(
      `INSERT INTO platform_object_permissions
       (object_id,role_id,company_id,can_view,can_create,can_edit,can_delete,
        source_package_id,source_package_version,managed,package_required)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,$10)
       ON CONFLICT(object_id,role_id,company_id)
       DO UPDATE SET can_view=CASE WHEN platform_object_permissions.user_modified THEN platform_object_permissions.can_view ELSE EXCLUDED.can_view END,
         can_create=CASE WHEN platform_object_permissions.user_modified THEN platform_object_permissions.can_create ELSE EXCLUDED.can_create END,
         can_edit=CASE WHEN platform_object_permissions.user_modified THEN platform_object_permissions.can_edit ELSE EXCLUDED.can_edit END,
         can_delete=CASE WHEN platform_object_permissions.user_modified THEN platform_object_permissions.can_delete ELSE EXCLUDED.can_delete END,
         source_package_version=EXCLUDED.source_package_version,managed=true,
         package_required=EXCLUDED.package_required
       WHERE platform_object_permissions.source_package_id=EXCLUDED.source_package_id
       RETURNING id`,
      [objectId, roleId, companyId, permission.canView !== false, permission.canCreate === true,
        permission.canEdit === true, permission.canDelete === true, packageId,
        packageVersion, permission.required === true]
    );
    if (!registered.rows?.length && registered.rowCount === 0) {
      throw new Error(`Package permission is owned by another declaration for role: ${roleId}`);
    }
  }

  for (const permission of Array.isArray(manifest.fieldPermissions) ? manifest.fieldPermissions : []) {
    const objectId = objectIds.get(permission.objectKey || permission.object_key);
    const fieldApiName = permission.fieldApiName || permission.field_api_name;
    const roleId = permission.roleId || permission.role_id;
    if (!objectId || !safeMetadataKey(fieldApiName) || !roleId || !companyId) {
      throw new Error("Package field permissions require a declared field, role, and company scope");
    }
    const field = await db(
      "SELECT id FROM platform_fields WHERE object_id=$1 AND api_name=$2 AND (company_id IS NULL OR company_id=$3)",
      [objectId, fieldApiName, companyId]
    );
    if (!field.rows.length) throw new Error(`Package permission field is not available: ${fieldApiName}`);
    const role = await db("SELECT id FROM roles WHERE id=$1 AND company_id=$2", [roleId, companyId]);
    if (!role.rows.length) throw new Error(`Package permission role is not available: ${roleId}`);
    const registered = await db(
      `INSERT INTO platform_field_security
       (field_id,role_id,company_id,readable,writable,source_package_id,source_package_version,managed,package_required)
       VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8)
       ON CONFLICT(field_id,role_id,company_id)
       DO UPDATE SET readable=CASE WHEN platform_field_security.user_modified THEN platform_field_security.readable ELSE EXCLUDED.readable END,
         writable=CASE WHEN platform_field_security.user_modified THEN platform_field_security.writable ELSE EXCLUDED.writable END,
         source_package_version=EXCLUDED.source_package_version,managed=true,
         package_required=EXCLUDED.package_required
       WHERE platform_field_security.source_package_id=EXCLUDED.source_package_id
       RETURNING id`,
      [field.rows[0].id, roleId, companyId, permission.readable !== false,
        permission.writable === true, packageId, packageVersion, permission.required === true]
    );
    if (!registered.rows?.length && registered.rowCount === 0) {
      throw new Error(`Package field permission is owned by another declaration: ${fieldApiName}`);
    }
  }

  for (const event of Array.isArray(manifest.events) ? manifest.events : []) {
    const eventType = String(event.eventType || event.event_type || "").trim();
    if (!eventType || eventType.length > 200) throw new Error("Package events require an event type of 1 to 200 characters");
    const registered = await db(
      `INSERT INTO platform_event_types(event_type,description,source_package_id,active)
       VALUES($1,$2,$3,TRUE)
       ON CONFLICT(event_type) DO UPDATE SET description=EXCLUDED.description,source_package_id=EXCLUDED.source_package_id,active=TRUE
       WHERE platform_event_types.source_package_id IS NULL OR platform_event_types.source_package_id=EXCLUDED.source_package_id
       RETURNING event_type`,
      [eventType, event.description || null, packageId]
    );
    if (!registered.rows.length) throw new Error(`Package event type is owned by another declaration: ${eventType}`);
  }

  const ownedPermissionCodes = manifest.metadataOwnership?.permissions;
  if (Array.isArray(ownedPermissionCodes) && ownedPermissionCodes.length) {
    const permissions = await db(
      "SELECT id,code FROM permissions WHERE code=ANY($1::text[])",
      [ownedPermissionCodes]
    );
    const permissionsByCode = new Map(permissions.rows.map((permission) => [permission.code, permission]));
    for (const code of ownedPermissionCodes) {
      const permission = permissionsByCode.get(code);
      if (!permission) throw new Error(`Package permission is not seeded: ${code}`);
      await db(
        `INSERT INTO package_metadata_ownership
         (package_id,package_version,metadata_type,metadata_id,managed,package_required,default_snapshot)
         VALUES ($1,$2,'permission',$3,true,true,$4::jsonb)
         ON CONFLICT(package_id,metadata_type,metadata_id) DO UPDATE SET
           package_version=EXCLUDED.package_version,managed=true,package_required=true,updated_at=NOW()`,
        [packageId, packageVersion, permission.id, JSON.stringify({ code })]
      );
    }
  }

  const ownedMetadata = await db(
    `WITH owned AS (
       SELECT 'object'::text AS metadata_type,o.id,o.package_required,o.user_modified,to_jsonb(o) AS snapshot
         FROM platform_objects o WHERE o.package_id=$1
       UNION ALL
       SELECT 'field',f.id,f.package_required,f.user_modified,to_jsonb(f)
         FROM platform_fields f JOIN platform_objects o ON o.id=f.object_id
        WHERE o.package_id=$1 OR f.source_package_id=$1
       UNION ALL
       SELECT 'relationship',r.id,r.package_required,r.user_modified,to_jsonb(r)
         FROM platform_relationships r WHERE r.source_package_id=$1
       UNION ALL
       SELECT CASE WHEN l.page_type IN ('create','edit','quick_create') THEN 'form' ELSE 'layout' END,
              l.id,l.package_required,l.user_modified,to_jsonb(l)
         FROM platform_layouts l WHERE l.source_package_id=$1
       UNION ALL
       SELECT CASE WHEN r.action->>'type'='validation' THEN 'validation' ELSE 'workflow' END,
              r.id,r.package_required,r.user_modified,to_jsonb(r)
         FROM platform_rules r WHERE r.source_package_id=$1
       UNION ALL
       SELECT 'report',r.id,r.package_required,r.user_modified,to_jsonb(r)
         FROM platform_reports r WHERE r.source_package_id=$1
       UNION ALL
       SELECT 'action',a.id,a.package_required,a.user_modified,to_jsonb(a)
         FROM platform_registered_actions a
        WHERE a.source_package_id=$1 OR a.config->>'packageId'=$1::text
       UNION ALL
       SELECT 'button',b.id,b.package_required,b.user_modified,to_jsonb(b)
         FROM platform_buttons b
        WHERE b.source_package_id=$1 OR b.config->>'packageId'=$1::text
       UNION ALL
       SELECT 'list_view',v.id,v.package_required,v.user_modified,to_jsonb(v)
         FROM platform_list_views v WHERE v.source_package_id=$1
       UNION ALL
       SELECT 'permission',p.id,p.package_required,p.user_modified,to_jsonb(p)
         FROM platform_object_permissions p WHERE p.source_package_id=$1
       UNION ALL
       SELECT 'field_permission',p.id,p.package_required,p.user_modified,to_jsonb(p)
         FROM platform_field_security p WHERE p.source_package_id=$1
       UNION ALL
       SELECT 'connector',c.id,c.package_required,c.user_modified,to_jsonb(c)
         FROM platform_connector_definitions c WHERE c.source_package_id=$1
       UNION ALL
       SELECT 'template',t.id,t.package_required,t.user_modified,to_jsonb(t)
         FROM platform_message_templates t WHERE t.source_package_id=$1
       UNION ALL
       SELECT 'app',a.id,a.package_required,a.user_modified,to_jsonb(a)
         FROM platform_apps a WHERE a.source_package_id=$1
       UNION ALL
       SELECT 'page',p.id,p.package_required,p.user_modified,to_jsonb(p)
         FROM platform_pages p WHERE p.source_package_id=$1
       UNION ALL
       SELECT 'page',p.id,false,false,to_jsonb(p) FROM platform_pages p
         JOIN platform_apps a ON a.id=p.app_id
        WHERE a.app_key=('package_' || replace($1::text,'-','_'))
     )
     INSERT INTO package_metadata_ownership
       (package_id,package_version,metadata_type,metadata_id,managed,package_required,user_modified,default_snapshot)
     SELECT $1::uuid,$2::text,metadata_type,id,true,package_required,user_modified,
            jsonb_build_object('packageVersion',$2::text,'metadata',snapshot)
       FROM owned
     ON CONFLICT(package_id,metadata_type,metadata_id) DO UPDATE SET
       package_version=EXCLUDED.package_version,managed=true,
       package_required=EXCLUDED.package_required,
       user_modified=package_metadata_ownership.user_modified OR EXCLUDED.user_modified,
       default_snapshot=CASE WHEN package_metadata_ownership.user_modified
         THEN package_metadata_ownership.default_snapshot ELSE EXCLUDED.default_snapshot END,
       updated_at=NOW()`,
    [packageId, packageVersion]
  );
  const conflicts = await db(
    `SELECT metadata_type,metadata_id
       FROM package_metadata_ownership
      WHERE package_id=$1 AND package_version=$2 AND managed=true AND user_modified=true
        AND default_snapshot->>'packageVersion' IS DISTINCT FROM $2`,
    [packageId, packageVersion]
  );
  await db(
    `UPDATE package_metadata_ownership
        SET managed=false,updated_at=NOW()
      WHERE package_id=$1 AND package_version<>$2 AND managed=true`,
    [packageId, packageVersion]
  );
  for (const table of [
    "platform_objects",
    "platform_fields",
    "platform_relationships",
    "platform_layouts",
    "platform_rules",
    "platform_reports",
    "platform_list_views",
    "platform_object_permissions",
    "platform_field_security",
    "platform_connector_definitions",
    "platform_message_templates",
    "platform_apps",
    "platform_pages",
    "platform_registered_actions",
    "platform_buttons",
  ]) {
    const ownerColumn = table === "platform_objects" ? "package_id" : "source_package_id";
    await db(
      `UPDATE ${table} metadata SET managed=false
        WHERE metadata.${ownerColumn}=$1 AND metadata.source_package_version IS DISTINCT FROM $2
          AND NOT EXISTS (
            SELECT 1 FROM package_metadata_ownership owner
             WHERE owner.package_id=$1 AND owner.metadata_id=metadata.id
               AND owner.package_version=$2 AND owner.managed=true
          )`,
      [packageId, packageVersion]
    );
  }
  return { objects: objectIds.size, ownedMetadata: ownedMetadata.rowCount || 0, conflicts: conflicts.rows || [] };
}

export async function capturePackageMetadataSnapshot(db, { packageId, companyId }) {
  const result = await db(
    `SELECT metadata_type,metadata_id,package_version,user_modified,package_required,
            default_snapshot->'metadata' AS state
       FROM package_metadata_ownership
      WHERE package_id=$1 AND managed=true
        AND (default_snapshot->'metadata'->>'company_id' IS NULL
          OR default_snapshot->'metadata'->>'company_id'=$2)
      ORDER BY metadata_type,metadata_id`,
    [packageId, companyId]
  );
  return (result.rows || []).map((row) => ({
    metadataType: row.metadata_type,
    metadataId: row.metadata_id,
    packageVersion: row.package_version,
    userModified: row.user_modified === true,
    packageRequired: row.package_required === true,
    state: row.state || null,
  }));
}

export async function provisionDefaultCompanyPackages(db, { companyId, installedBy = null, packageKeys = ["staff", "retail_pos", "products", "customers"] }) {
  for (const packageKey of packageKeys) {
    const packageResult = await db(
      `SELECT p.id, p.version, p.module_id, p.manifest
       FROM package_registry p
       WHERE p.package_key=$1 AND p.active=true`,
      [packageKey]
    );
    if (!packageResult.rows.length) continue;
    const pkg = packageResult.rows[0];
    if (packageKey === "products") {
      await provisionPackageMetadata(db, {
        packageId: pkg.id,
        moduleId: pkg.module_id,
        companyId,
        manifest: pkg.manifest || {},
        packageVersion: pkg.version,
      });
    }
    await db(
      `INSERT INTO company_package_installations
       (company_id,package_id,version,status,installed_by,installation_type)
       VALUES ($1,$2,$3,'active',$4,'PLATFORM_DEFAULT')
       ON CONFLICT (company_id,package_id) DO NOTHING`,
      [companyId, pkg.id, pkg.version, installedBy]
    );
    await db(
      `INSERT INTO company_package_entitlement_sources
       (company_id,package_id,source_type,source_key,active,metadata)
       VALUES ($1,$2,'PLATFORM_DEFAULT',$3,true,$4::jsonb)
       ON CONFLICT(company_id,package_id,source_type,source_key)
       DO UPDATE SET active=true,metadata=EXCLUDED.metadata`,
      [companyId, pkg.id, `platform-default:${pkg.id}`, JSON.stringify({ installationType: "PLATFORM_DEFAULT" })]
    );
    if (packageKey === "staff" || packageKey === "products") {
      await provisionPackageMetadata(db, {
        packageId: pkg.id,
        moduleId: pkg.module_id,
        companyId,
        manifest: pkg.manifest || {},
        packageVersion: pkg.version,
      });
    }
    if (pkg.module_id) {
      await db(
        `INSERT INTO platform_module_access (module_id,company_id,store_id,enabled)
         VALUES ($1,$2,NULL,true)
         ON CONFLICT (module_id,company_id,COALESCE(store_id,'00000000-0000-0000-0000-000000000000'::uuid))
         DO UPDATE SET enabled=true,updated_at=NOW()`,
        [pkg.module_id, companyId]
      );
    }
  }
}

export async function removePackageMetadata(db, { companyId, packageId }) {
  const ownership = await db(
    `SELECT metadata_type,metadata_id
       FROM package_metadata_ownership
      WHERE package_id=$1 AND managed=true AND package_required=false AND user_modified=false`,
    [packageId]
  );
  const removable = new Map();
  for (const row of ownership.rows) {
    const ids = removable.get(row.metadata_type) || [];
    ids.push(row.metadata_id);
    removable.set(row.metadata_type, ids);
  }
  const scopedDelete = (table, type, ownerColumn = "source_package_id") => {
    const ids = removable.get(type) || [];
    if (!ids.length) return Promise.resolve({ rowCount: 0 });
    if (table === "platform_relationships") return Promise.resolve({ rowCount: 0 });
    return db(
      `DELETE FROM ${table}
        WHERE id=ANY($1::uuid[]) AND ${ownerColumn}=$2 AND company_id=$3
        RETURNING id`,
      [ids, packageId, companyId]
    );
  };
  const removedIds = [];
  const removeScoped = async (table, type, ownerColumn) => {
    const ids = removable.get(type) || [];
    if (!ids.length) return;
    const result = await scopedDelete(table, type, ownerColumn);
    removedIds.push(...(result.rows || []).map((row) => row.id));
  };

  for (const type of ["field_permission", "permission"]) {
    await removeScoped(type === "permission" ? "platform_object_permissions" : "platform_field_security", type);
  }
  await removeScoped("platform_layouts", "form");
  await removeScoped("platform_layouts", "layout");
  await removeScoped("platform_rules", "workflow");
  await removeScoped("platform_reports", "report");
  await removeScoped("platform_list_views", "list_view");
  await removeScoped("platform_registered_actions", "action");
  await removeScoped("platform_buttons", "button");
  await removeScoped("platform_pages", "page");
  await removeScoped("platform_apps", "app");
  // Connector definitions are global and may be referenced by retained
  // connection configuration or encrypted credentials after an app uninstall.
  await removeScoped("platform_message_templates", "template");
  await removeScoped("platform_relationships", "relationship");
  await removeScoped("platform_fields", "field");

  const objectIds = removable.get("object") || [];
  if (objectIds.length) {
    const deletedObjects = await db(
      `DELETE FROM platform_objects o
        WHERE o.id=ANY($1::uuid[]) AND o.package_id=$3
          AND o.managed=true AND o.package_required=false AND o.user_modified=false
          AND o.company_id=$2
          AND NOT EXISTS (
            SELECT 1 FROM platform_relationships r
             WHERE (r.parent_object_id=o.id OR r.child_object_id=o.id)
               AND r.source_package_id IS DISTINCT FROM $3
          )
          AND NOT EXISTS (
            SELECT 1 FROM platform_fields f WHERE f.object_id=o.id
              AND f.source_package_id IS DISTINCT FROM $3
          )
          AND NOT EXISTS (
            SELECT 1 FROM platform_layouts l WHERE l.object_id=o.id
              AND l.source_package_id IS DISTINCT FROM $3
          )
          AND NOT EXISTS (
            SELECT 1 FROM platform_reports r WHERE r.object_id=o.id
              AND r.source_package_id IS DISTINCT FROM $3
          )
        RETURNING o.id`,
        [objectIds, companyId, packageId]
    );
    removedIds.push(...(deletedObjects.rows || []).map((row) => row.id));
  }

  if (removedIds.length) {
    await db(
      `DELETE FROM package_metadata_ownership
        WHERE package_id=$1 AND metadata_id=ANY($2::uuid[])`,
      [packageId, [...new Set(removedIds)]]
    );
  }
}

export async function verifyPublicPackageRegistry(queryTarget) {
  const query = typeof queryTarget === "function"
    ? queryTarget
    : queryTarget?.query?.bind(queryTarget);
  if (typeof query !== "function") throw new Error("Package registry verification requires a query function");

  const expected = packageDefinitions()
    .filter((definition) =>
      definition?.manifest?.visibility !== "HIDDEN" &&
      definition?.manifest?.systemOnly !== true &&
      (definition?.manifest?.lifecycleState || "PUBLISHED") === "PUBLISHED"
    )
    .map((definition) => ({
      packageKey: definition.packageKey,
      version: definition.version,
      name: definition.name,
    }));

  if (!expected.length) {
    return { healthy: true, expectedCount: 0, actualCount: 0, missing: [], stale: [] };
  }

  const keys = expected.map((item) => item.packageKey);
  const result = await query(
    `SELECT package_key,name,version,visible,system_only,publication_state,active
       FROM package_registry
      WHERE package_key=ANY($1::text[])`,
    [keys]
  );
  const rows = Array.isArray(result?.rows) ? result.rows : [];
  const byKey = new Map(rows.map((row) => [row.package_key, row]));
  const missing = expected.filter((item) => !byKey.has(item.packageKey)).map((item) => item.packageKey);
  const stale = expected.flatMap((item) => {
    const row = byKey.get(item.packageKey);
    if (!row) return [];
    const reasons = [];
    if (row.visible !== true) reasons.push("not_visible");
    if (row.system_only === true) reasons.push("system_only");
    if (String(row.publication_state || "").toUpperCase() !== "PUBLISHED") reasons.push("not_published");
    if (row.active !== true) reasons.push("inactive");
    if (String(row.version || "") !== String(item.version || "")) reasons.push("version_mismatch");
    if (String(row.name || "") !== String(item.name || "")) reasons.push("name_mismatch");
    return reasons.length ? [{ packageKey: item.packageKey, reasons }] : [];
  });

  return {
    healthy: missing.length === 0 && stale.length === 0,
    expectedCount: expected.length,
    actualCount: rows.length,
    missing,
    stale,
  };
}

export function seedPackageRegistry(pool) {
  return (async () => {
    const definitions = packageDefinitions();
    try {
      const moduleKeys = [...new Set(definitions.map((definition) => definition.moduleKey).filter(Boolean))];
      const moduleRows = moduleKeys.length
        ? (await pool.query(
            "SELECT id,module_key FROM platform_modules WHERE module_key=ANY($1::text[])",
            [moduleKeys]
          )).rows
        : [];
      const moduleByKey = new Map(moduleRows.map((row) => [row.module_key, row]));
      for (const definition of definitions) {
      const moduleRow = moduleByKey.get(definition.moduleKey);
      if (!moduleRow) continue;
      await pool.query(
        `INSERT INTO package_registry
         (package_key,name,version,description,module_id,manifest,package_type,publisher,category,visible,installable,billable,system_only,display_order,publication_state,licence_mode,available_tiers)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb)
         ON CONFLICT (package_key) DO UPDATE SET
           name=EXCLUDED.name,
           version=EXCLUDED.version,
           description=EXCLUDED.description,
           module_id=EXCLUDED.module_id,
           manifest=EXCLUDED.manifest,
           package_type=EXCLUDED.package_type,
           publisher=EXCLUDED.publisher,
           category=EXCLUDED.category,
           visible=EXCLUDED.visible,
           installable=EXCLUDED.installable,
           billable=EXCLUDED.billable,
           system_only=EXCLUDED.system_only,
           display_order=EXCLUDED.display_order,
           publication_state=EXCLUDED.publication_state,
           licence_mode=EXCLUDED.licence_mode,
           available_tiers=EXCLUDED.available_tiers,
           active=TRUE,
           updated_at=NOW()`,
        [
          definition.packageKey, definition.name, definition.version, definition.description,
          moduleRow.id, JSON.stringify(definition.manifest),
          definition.manifest.packageType, definition.manifest.publisher, definition.manifest.category,
          definition.manifest.visibility !== "HIDDEN", definition.manifest.installable !== false,
          definition.manifest.billable !== false, definition.manifest.systemOnly === true,
          Number(definition.manifest.displayOrder || 0), definition.manifest.lifecycleState || "PUBLISHED",
          definition.manifest.licenceMode, JSON.stringify(definition.manifest.availableTiers || []),
        ]
      );
      }
      const packageRows = (await pool.query(
        "SELECT id,package_key FROM package_registry WHERE package_key=ANY($1::text[])",
        [definitions.map((definition) => definition.packageKey)]
      )).rows;
      const packageByKey = new Map(packageRows.map((row) => [row.package_key, row]));
      for (const definition of definitions) {
      const packageRow = packageByKey.get(definition.packageKey);
      if (!packageRow) continue;
      await pool.query("DELETE FROM package_dependencies WHERE package_id=$1", [packageRow.id]);
      const dependencies = [
        ...definition.dependencies,
        ...definition.manifest.optionalDependencies.map((dependency) => (
          typeof dependency === "string" ? { packageKey: dependency, optional: true } : { ...dependency, optional: true }
        )),
      ];
      for (const dependency of dependencies) {
        const dependencyKey = typeof dependency === "string" ? dependency : dependency.packageKey || dependency.package_key;
        const dependencyRow = packageByKey.get(dependencyKey);
        if (!dependencyRow) throw new Error(`Package dependency not found: ${dependencyKey}`);
        await pool.query(
          `INSERT INTO package_dependencies
           (package_id,dependency_id,version_range,min_version,max_version,optional)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [
            packageRow.id,
            dependencyRow.id,
            typeof dependency === "string" ? null : dependency.versionRange || dependency.version_range || null,
            typeof dependency === "string" ? null : dependency.minVersion || dependency.min_version || null,
            typeof dependency === "string" ? null : dependency.maxVersion || dependency.max_version || null,
            typeof dependency === "string" ? false : dependency.optional === true,
          ]
        );
      }
      }
    } catch (error) {
      if (error?.code) throw error;
      console.warn("Package registry is unavailable; continuing Platform metadata bootstrap.");
    }
    return definitions;
  })();
}
