/**
 * Canonical OneSolutions development/demo seed.
 *
 * Source of truth for a clean OneEngine test installation. Keep this seeder
 * idempotent: deleting/changing demo data must be reflected here too.
 *
 * This deliberately seeds ONE company only. Business lines are tenant
 * metadata records, not separate companies and not hard-coded authorization.
 */
export async function seedOneSolutionsDemo(pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let company = (await client.query(
      "SELECT id FROM companies WHERE LOWER(name)=LOWER($1) ORDER BY created_at,id LIMIT 1",
      ["OneSolutions"]
    )).rows[0];
    if (!company) {
      company = (await client.query(
        `INSERT INTO companies(name,legal_name,email,currency,timezone,active)
         VALUES('OneSolutions','One Solutions','hello@onepos.com','GBP','Europe/London',TRUE)
         RETURNING id`
      )).rows[0];
    } else {
      await client.query(
        `UPDATE companies SET legal_name='One Solutions',email='hello@onepos.com',
           currency='GBP',timezone='Europe/London',active=TRUE,updated_at=NOW()
         WHERE id=$1`, [company.id]
      );
    }

    await client.query(
      `INSERT INTO company_settings(company_id,date_format,vat_enabled,default_vat_rate,
          loyalty_enabled,scan_go_enabled,exchange_mode,product_view,customer_display_enabled,
          online_ordering_enabled,online_payment_methods,till_invoice_prefix,delivery_invoice_prefix,
          self_checkout_invoice_prefix)
       VALUES($1,'DD/MM/YYYY',TRUE,20,TRUE,TRUE,'both','image',TRUE,TRUE,
              '["card","cash","cod"]'::jsonb,'TO','DEL','SC')
       ON CONFLICT(company_id) DO UPDATE SET
          date_format=EXCLUDED.date_format,vat_enabled=EXCLUDED.vat_enabled,
          default_vat_rate=EXCLUDED.default_vat_rate,loyalty_enabled=EXCLUDED.loyalty_enabled,
          scan_go_enabled=EXCLUDED.scan_go_enabled,exchange_mode=EXCLUDED.exchange_mode,
          product_view=EXCLUDED.product_view,customer_display_enabled=EXCLUDED.customer_display_enabled,
          online_ordering_enabled=EXCLUDED.online_ordering_enabled,
          online_payment_methods=EXCLUDED.online_payment_methods`, [company.id]
    );

    let store = (await client.query(
      "SELECT id FROM stores WHERE company_id=$1 AND code='ONES-HQ' ORDER BY created_at,id LIMIT 1",
      [company.id]
    )).rows[0];
    if (!store) {
      store = (await client.query(
        `INSERT INTO stores(company_id,name,code,city,postcode,active)
         VALUES($1,'OneSolutions Demo Hub','ONES-HQ','London','E16',TRUE) RETURNING id`,
        [company.id]
      )).rows[0];
    } else {
      await client.query("UPDATE stores SET name='OneSolutions Demo Hub',active=TRUE WHERE id=$1",[store.id]);
    }

    let terminal = (await client.query(
      "SELECT id FROM terminals WHERE company_id=$1 AND store_id=$2 AND terminal_number='TILL-01' LIMIT 1",
      [company.id,store.id]
    )).rows[0];
    if (!terminal) {
      terminal=(await client.query(
        `INSERT INTO terminals(company_id,store_id,name,terminal_number,active)
         VALUES($1,$2,'Main Till','TILL-01',TRUE) RETURNING id`,[company.id,store.id]
      )).rows[0];
    }

    // Business divisions are a normal tenant Platform Object. Product mapping
    // is a tenant extension lookup stored through platform_record_associations.
    await client.query(`
      CREATE TABLE IF NOT EXISTS onesolutions_business_divisions(
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        division_key VARCHAR(80) NOT NULL,
        name VARCHAR(160) NOT NULL,
        description TEXT,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(company_id,division_key)
      )`);

    let divisionObject=(await client.query(
      "SELECT id FROM platform_objects WHERE object_key='onesolutions_business_division' LIMIT 1"
    )).rows[0];
    if (!divisionObject) {
      divisionObject=(await client.query(
        `INSERT INTO platform_objects(object_key,api_name,label,plural_label,description,source_table,company_id,company_scoped,store_scoped,active)
         VALUES('onesolutions_business_division','onesolutions_business_division','Business Division','Business Divisions',
                'Metadata-driven OneSolutions demo business divisions','onesolutions_business_divisions',$1,TRUE,FALSE,TRUE)
         RETURNING id`,[company.id]
      )).rows[0];
    }

    const divisionFields=[
      ['id','ID','text','id',true,false,0],
      ['division_key','Division Key','text','division_key',true,true,10],
      ['name','Name','text','name',true,true,20],
      ['description','Description','text','description',false,true,30],
      ['active','Active','boolean','active',true,true,40],
    ];
    for (const [api,label,type,column,required,writable,order] of divisionFields) {
      await client.query(
        `INSERT INTO platform_fields(object_id,company_id,api_name,label,field_type,source_column,required,readable,writable,display_order,active)
         VALUES($1,$2,$3,$4,$5,$6,$7,TRUE,$8,$9,TRUE)
         ON CONFLICT(object_id,company_id,api_name) WHERE company_id IS NOT NULL
         DO UPDATE SET label=EXCLUDED.label,field_type=EXCLUDED.field_type,source_column=EXCLUDED.source_column,
                       required=EXCLUDED.required,writable=EXCLUDED.writable,display_order=EXCLUDED.display_order,active=TRUE`,
        [divisionObject.id,company.id,api,label,type,column,required,writable,order]
      );
    }

    const divisions=[
      ['retail','Retail','General retail, inventory, till, loyalty and self-checkout'],
      ['restaurant_qsr','Restaurant & QSR','Kiosk, table ordering, kitchen display and online orders'],
      ['beauty_barber','Beauty & Barber','Appointments and SMS-assisted booking'],
      ['cleaning_services','Cleaning & Field Services','Bookable services, customer billing and field work'],
      ['electronics','Electronics','Catalogue retail, variants, stock and assisted checkout'],
    ];
    const divisionIds={};
    for (const [key,name,description] of divisions) {
      const row=(await client.query(
        `INSERT INTO onesolutions_business_divisions(company_id,division_key,name,description,active)
         VALUES($1,$2,$3,$4,TRUE)
         ON CONFLICT(company_id,division_key) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,active=TRUE,updated_at=NOW()
         RETURNING id`,[company.id,key,name,description]
      )).rows[0];
      divisionIds[key]=row.id;
    }

    const productObject=(await client.query(
      "SELECT id FROM platform_objects WHERE object_key='product' AND active=TRUE ORDER BY company_id NULLS FIRST LIMIT 1"
    )).rows[0];
    let divisionLookup=null;
    if (productObject) {
      divisionLookup=(await client.query(
        `INSERT INTO platform_fields(object_id,company_id,api_name,label,field_type,required,readable,writable,config,display_order,active)
         VALUES($1,$2,'business_division_id','Business Division','lookup',FALSE,TRUE,TRUE,
                '{"relatedObjectKey":"onesolutions_business_division"}'::jsonb,900,TRUE)
         ON CONFLICT(object_id,company_id,api_name) WHERE company_id IS NOT NULL
         DO UPDATE SET label=EXCLUDED.label,field_type='lookup',writable=TRUE,config=EXCLUDED.config,active=TRUE
         RETURNING id`,[productObject.id,company.id]
      )).rows[0];
      await client.query(
        `INSERT INTO platform_relationships(parent_object_id,child_object_id,relationship_key,label,description,relationship_type,child_field_id,on_delete,on_update,active)
         VALUES($1,$2,'products','Products','Products mapped to this business division','one_to_many',$3,'restrict','restrict',TRUE)
         ON CONFLICT(parent_object_id,relationship_key) DO UPDATE SET child_object_id=EXCLUDED.child_object_id,
           child_field_id=EXCLUDED.child_field_id,label=EXCLUDED.label,description=EXCLUDED.description,active=TRUE`,
        [divisionObject.id,productObject.id,divisionLookup.id]
      );
    }

    const categories=[
      ['Retail Essentials',10],['QSR Menu',20],['Beauty Services',30],['Cleaning Services',40],['Electronics',50]
    ];
    const categoryIds={};
    for(const [name,displayOrder] of categories){
      let row=(await client.query("SELECT id FROM categories WHERE company_id=$1 AND name=$2 LIMIT 1",[company.id,name])).rows[0];
      if(!row) row=(await client.query(
        "INSERT INTO categories(company_id,name,display_order,active) VALUES($1,$2,$3,TRUE) RETURNING id",
        [company.id,name,displayOrder]
      )).rows[0];
      categoryIds[name]=row.id;
    }

    const products=[
      {d:'retail',c:'Retail Essentials',n:'Sparkling Water 500ml',sku:'DEMO-RET-001',barcode:'5010000000001',p:1.49,cost:.45,stock:80,img:'https://images.unsplash.com/photo-1523362628745-0c100150b504?auto=format&fit=crop&w=800&q=80'},
      {d:'retail',c:'Retail Essentials',n:'Fresh Sandwich',sku:'DEMO-RET-002',barcode:'5010000000002',p:4.25,cost:1.55,stock:24,img:'https://images.unsplash.com/photo-1553909489-cd47e0907980?auto=format&fit=crop&w=800&q=80'},
      {d:'restaurant_qsr',c:'QSR Menu',n:'Classic Burger',sku:'DEMO-QSR-001',barcode:'5010000000101',p:6.99,cost:2.10,stock:100,img:'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=800&q=80'},
      {d:'restaurant_qsr',c:'QSR Menu',n:'Crispy Fries',sku:'DEMO-QSR-002',barcode:'5010000000102',p:2.79,cost:.65,stock:100,img:'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=800&q=80'},
      {d:'beauty_barber',c:'Beauty Services',n:'Classic Haircut',sku:'DEMO-BAR-001',barcode:'5010000000201',p:25,cost:0,stock:0,track:false,img:'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=800&q=80'},
      {d:'beauty_barber',c:'Beauty Services',n:'Beard Trim',sku:'DEMO-BAR-002',barcode:'5010000000202',p:15,cost:0,stock:0,track:false,img:'https://images.unsplash.com/photo-1621605815971-fbc98d665033?auto=format&fit=crop&w=800&q=80'},
      {d:'cleaning_services',c:'Cleaning Services',n:'Exterior Cleaning Visit',sku:'DEMO-CLN-001',barcode:'5010000000301',p:85,cost:0,stock:0,track:false,img:'https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=800&q=80'},
      {d:'cleaning_services',c:'Cleaning Services',n:'Deep Clean Service',sku:'DEMO-CLN-002',barcode:'5010000000302',p:140,cost:0,stock:0,track:false,img:'https://images.unsplash.com/photo-1527515637462-cff94eecc1ac?auto=format&fit=crop&w=800&q=80'},
      {d:'electronics',c:'Electronics',n:'Wireless Headphones',sku:'DEMO-ELC-001',barcode:'5010000000401',p:59.99,cost:28,stock:18,img:'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=800&q=80'},
      {d:'electronics',c:'Electronics',n:'USB-C Charger',sku:'DEMO-ELC-002',barcode:'5010000000402',p:24.99,cost:8.50,stock:35,img:'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=800&q=80'},
    ];
    for(const p of products){
      const row=(await client.query(
        `INSERT INTO products(company_id,category_id,name,sku,barcode,description,price,cost_price,vat_rate,vat_applicable,
                              stock_quantity,low_stock_level,track_stock,image_url,active,kiosk_metadata)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,20,TRUE,$9,5,$10,$11,TRUE,$12::jsonb)
         ON CONFLICT(company_id,LOWER(sku)) WHERE sku IS NOT NULL AND active=TRUE
         DO UPDATE SET category_id=EXCLUDED.category_id,name=EXCLUDED.name,barcode=EXCLUDED.barcode,
                       description=EXCLUDED.description,price=EXCLUDED.price,cost_price=EXCLUDED.cost_price,
                       stock_quantity=EXCLUDED.stock_quantity,track_stock=EXCLUDED.track_stock,image_url=EXCLUDED.image_url,
                       kiosk_metadata=EXCLUDED.kiosk_metadata,updated_at=NOW()
         RETURNING id`,
        [company.id,categoryIds[p.c],p.n,p.sku,p.barcode,`OneSolutions ${p.d} demo item`,p.p,p.cost,p.stock,p.track!==false,p.img,JSON.stringify({demo:true,division:p.d})]
      )).rows[0];
      await client.query(
        `INSERT INTO product_store_stock(company_id,store_id,product_id,quantity)
         VALUES($1,$2,$3,$4)
         ON CONFLICT(company_id,store_id,product_id) DO UPDATE SET quantity=EXCLUDED.quantity,updated_at=NOW()`,
        [company.id,store.id,row.id,p.stock]
      );
      if(productObject){
        await client.query(
          `INSERT INTO platform_record_associations(object_id,record_id,company_id,custom_values)
           VALUES($1,$2,$3,$4::jsonb)
           ON CONFLICT(object_id,record_id)
           DO UPDATE SET custom_values=platform_record_associations.custom_values || EXCLUDED.custom_values`,
          [productObject.id,row.id,company.id,JSON.stringify({business_division_id:divisionIds[p.d]})]
        );
      }
    }

    const customers=[
      ['Alex Morgan','alex.demo@example.com','07700900001','Retail loyalty demo'],
      ['Jamie Taylor','jamie.demo@example.com','07700900002','Appointment demo'],
      ['Sam Patel','sam.demo@example.com','07700900003','Service billing demo'],
    ];
    const customerIds={};
    for(const [name,email,phone,notes] of customers){
      let row=(await client.query("SELECT id FROM customers WHERE company_id=$1 AND LOWER(email)=LOWER($2) LIMIT 1",[company.id,email])).rows[0];
      if(!row) row=(await client.query(
        `INSERT INTO customers(company_id,name,email,phone,notes,active,credit_enabled,credit_limit)
         VALUES($1,$2,$3,$4,$5,TRUE,FALSE,0) RETURNING id`,[company.id,name,email,phone,notes]
      )).rows[0];
      customerIds[email]=row.id;
      await client.query(
        `INSERT INTO customer_stores(customer_id,store_id,active) VALUES($1,$2,TRUE)
         ON CONFLICT(customer_id,store_id) DO UPDATE SET active=TRUE`,[row.id,store.id]
      );
    }

    // Appointment sample data is seeded only when OneAssistant foundation is
    // present; clean startup creates it before this seeder runs.
    const appointmentTables=(await client.query("SELECT to_regclass('appointment_services') AS services")).rows[0];
    if(appointmentTables?.services){
      const serviceSpecs=[
        ['Classic Haircut',30,25,'beauty_barber'],
        ['Beard Trim',20,15,'beauty_barber'],
        ['Exterior Cleaning Visit',90,85,'cleaning_services'],
        ['Deep Clean Service',180,140,'cleaning_services'],
      ];
      const serviceIds={};
      for(const [name,duration,price,division] of serviceSpecs){
        let row=(await client.query("SELECT id FROM appointment_services WHERE company_id=$1 AND name=$2 LIMIT 1",[company.id,name])).rows[0];
        if(!row) row=(await client.query(
          `INSERT INTO appointment_services(company_id,name,description,duration_minutes,price,currency,payment_policy,active,metadata)
           VALUES($1,$2,$3,$4,$5,'GBP','NO_ADVANCE',TRUE,$6::jsonb) RETURNING id`,
          [company.id,name,`OneSolutions ${division} demo service`,duration,price,JSON.stringify({demo:true,division})]
        )).rows[0];
        serviceIds[name]=row.id;
      }
      let resource=(await client.query("SELECT id FROM appointment_resources WHERE company_id=$1 AND name='Demo Specialist' LIMIT 1",[company.id])).rows[0];
      if(!resource) resource=(await client.query(
        `INSERT INTO appointment_resources(company_id,store_id,name,resource_type,timezone,active,metadata)
         VALUES($1,$2,'Demo Specialist','STAFF','Europe/London',TRUE,'{"demo":true}'::jsonb) RETURNING id`,
        [company.id,store.id]
      )).rows[0];
      for(const sid of Object.values(serviceIds)){
        await client.query(
          `INSERT INTO appointment_resource_services(company_id,resource_id,service_id,active)
           VALUES($1,$2,$3,TRUE) ON CONFLICT(resource_id,service_id) DO UPDATE SET active=TRUE`,
          [company.id,resource.id,sid]
        );
      }
      for(let weekday=1;weekday<=6;weekday++){
        const exists=(await client.query(
          "SELECT id FROM appointment_availability_rules WHERE company_id=$1 AND resource_id=$2 AND weekday=$3 AND start_time='09:00'::time AND end_time='18:00'::time LIMIT 1",
          [company.id,resource.id,weekday]
        )).rows[0];
        if(!exists) await client.query(
          `INSERT INTO appointment_availability_rules(company_id,resource_id,weekday,start_time,end_time,slot_interval_minutes,active)
           VALUES($1,$2,$3,'09:00','18:00',15,TRUE)`,[company.id,resource.id,weekday]
        );
      }
      const demoAppointment=(await client.query(
        "SELECT id FROM appointments WHERE company_id=$1 AND metadata->>'seedKey'='demo-haircut-booking' LIMIT 1",[company.id]
      )).rows[0];
      if(!demoAppointment){
        await client.query(
          `INSERT INTO appointments(company_id,store_id,service_id,resource_id,customer_id,customer_name,customer_phone,customer_email,
                                    starts_at,ends_at,status,source_channel,notes,payment_status,metadata)
           VALUES($1,$2,$3,$4,$5,'Jamie Taylor','07700900002','jamie.demo@example.com',
                  date_trunc('day',NOW()) + INTERVAL '2 days 10 hours',
                  date_trunc('day',NOW()) + INTERVAL '2 days 10 hours 30 minutes',
                  'CONFIRMED','SMS','Seeded booking used to verify occupied slots are not offered again','NOT_REQUIRED',
                  '{"demo":true,"seedKey":"demo-haircut-booking","division":"beauty_barber"}'::jsonb)`,
          [company.id,store.id,serviceIds['Classic Haircut'],resource.id,customerIds['jamie.demo@example.com']]
        );
      }
    }

    await client.query("COMMIT");
    console.log("onePOS: canonical OneSolutions demo seed ready", { companyId: company.id, storeId: store.id });
    return { companyId: company.id, storeId: store.id, terminalId: terminal.id };
  } catch(error){
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
