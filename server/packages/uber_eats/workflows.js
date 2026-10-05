export const uberEatsWorkflowDefinitions = () => [
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
