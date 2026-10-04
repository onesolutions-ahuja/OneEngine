export const bookingSessionMetadataSql = `
  UPDATE platform_fields field SET writable=TRUE
    FROM platform_objects object
   WHERE field.object_id=object.id AND object.object_key='appointment_booking_case'
     AND object.source_table='appointment_booking_cases'
     AND field.api_name IN ('channel','sender','recipient','subject','body')
     AND field.managed=TRUE AND COALESCE(field.user_modified,FALSE)=FALSE;
  INSERT INTO platform_fields
    (object_id,api_name,label,field_type,source_column,required,readable,writable,options,config,display_order,
     company_id,source_package_id,source_package_version,managed,package_required)
  SELECT object.id,definition.api_name,definition.label,definition.field_type,definition.api_name,
    FALSE,TRUE,TRUE,'[]'::jsonb,definition.config,100,object.company_id,object.package_id,
    object.source_package_version,TRUE,FALSE
    FROM platform_objects object
    CROSS JOIN (VALUES
      ('state','Conversation State','json','{}'::jsonb),
      ('customer_id','Customer','lookup','{"relatedObjectKey":"customer"}'::jsonb)
    ) definition(api_name,label,field_type,config)
   WHERE object.object_key='appointment_booking_case' AND object.source_table='appointment_booking_cases'
     AND NOT EXISTS (SELECT 1 FROM platform_fields field WHERE field.object_id=object.id AND field.api_name=definition.api_name);
`;
