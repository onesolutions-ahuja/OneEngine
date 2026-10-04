/**
 * Canonical OneSolutions development/demo seed.
 *
 * Keep startup deliberately small and platform-core only.
 * Business/app data belongs to installable package metadata + flows, not to
 * the server bootstrap. This seeder must never recreate legacy business
 * tables that were intentionally removed from the platform schema.
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
        `UPDATE companies
            SET legal_name='One Solutions',
                email='hello@onepos.com',
                currency='GBP',
                timezone='Europe/London',
                active=TRUE,
                updated_at=NOW()
          WHERE id=$1`,
        [company.id]
      );
    }

    // Core tenant settings only. No business package tables are created here.
    await client.query(
      `INSERT INTO company_settings(
          company_id,date_format,vat_enabled,default_vat_rate,
          loyalty_enabled,scan_go_enabled,exchange_mode,product_view,
          customer_display_enabled,online_ordering_enabled,
          online_payment_methods,till_invoice_prefix,
          delivery_invoice_prefix,self_checkout_invoice_prefix
        )
       VALUES(
          $1,'DD/MM/YYYY',TRUE,20,
          FALSE,FALSE,'both','image',
          FALSE,FALSE,'[]'::jsonb,
          'TO','DEL','SC'
        )
       ON CONFLICT(company_id) DO UPDATE SET
          date_format=EXCLUDED.date_format,
          vat_enabled=EXCLUDED.vat_enabled,
          default_vat_rate=EXCLUDED.default_vat_rate`,
      [company.id]
    );

    let store = (await client.query(
      "SELECT id FROM stores WHERE company_id=$1 AND code='ONES-HQ' ORDER BY created_at,id LIMIT 1",
      [company.id]
    )).rows[0];

    if (!store) {
      store = (await client.query(
        `INSERT INTO stores(company_id,name,code,city,postcode,active)
         VALUES($1,'OneSolutions Demo Hub','ONES-HQ','London','E16',TRUE)
         RETURNING id`,
        [company.id]
      )).rows[0];
    } else {
      await client.query(
        "UPDATE stores SET name='OneSolutions Demo Hub',active=TRUE WHERE id=$1",
        [store.id]
      );
    }

    // Communication Core is platform-level. Seed examples only when the
    // canonical event table exists; never depend on channel-specific tables.
    const communicationTable = (await client.query(
      "SELECT to_regclass('public.platform_communication_events') AS table_name"
    )).rows[0]?.table_name;

    if (communicationTable) {
      const communicationSeeds = [
        {
          channel: "WHATSAPP",
          eventType: "communication.message_received",
          direction: "INBOUND",
          provider: "whatsapp",
          sender: "07700900002",
          recipient: "OneSolutions Demo",
          body: "Appointment",
          seedKey: "demo-communication-whatsapp-inbound",
        },
        {
          channel: "SMS",
          eventType: "communication.message_received",
          direction: "INBOUND",
          provider: "smsgate",
          sender: "07700900002",
          recipient: "OneSolutions Demo",
          body: "Need help booking an appointment",
          seedKey: "demo-communication-sms-inbound",
        },
        {
          channel: "EMAIL",
          eventType: "communication.message_received",
          direction: "INBOUND",
          provider: "email",
          sender: "jamie.demo@example.com",
          recipient: "bookings@onesolutions.demo",
          body: "Please book an appointment for me",
          seedKey: "demo-communication-email-inbound",
        },
      ];

      for (const event of communicationSeeds) {
        await client.query(
          `INSERT INTO platform_communication_events
             (company_id,channel,event_type,direction,provider,sender,recipient,body,metadata,created_at)
           SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,NOW()
           WHERE NOT EXISTS (
             SELECT 1
               FROM platform_communication_events
              WHERE company_id=$1
                AND metadata->>'seedKey'=$10
           )`,
          [
            company.id,
            event.channel,
            event.eventType,
            event.direction,
            event.provider,
            event.sender,
            event.recipient,
            event.body,
            JSON.stringify({
              demo: true,
              seedKey: event.seedKey,
              communicationCore: true,
            }),
            event.seedKey,
          ]
        );
      }
    }

    await client.query("COMMIT");
    console.log("onePOS: canonical OneSolutions core seed ready", {
      companyId: company.id,
      storeId: store.id,
    });

    return { companyId: company.id, storeId: store.id };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
