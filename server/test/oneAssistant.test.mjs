import test from "node:test";
import assert from "node:assert/strict";
import { calculateAppointmentPayment } from "../services/oneAssistant.js";

test("OneAssistant payment policy calculations",()=>{
  assert.equal(calculateAppointmentPayment({price:100,payment_policy:"NO_ADVANCE",deposit_value:20}),0);
  assert.equal(calculateAppointmentPayment({price:100,payment_policy:"FIXED_DEPOSIT",deposit_value:20}),20);
  assert.equal(calculateAppointmentPayment({price:100,payment_policy:"PERCENT_DEPOSIT",deposit_value:25}),25);
  assert.equal(calculateAppointmentPayment({price:100,payment_policy:"FULL_PAYMENT",deposit_value:20}),100);
  assert.equal(calculateAppointmentPayment({price:10,payment_policy:"FIXED_DEPOSIT",deposit_value:50}),10);
});


