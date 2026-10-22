import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { CheckoutStateError } from "../src/lib/payment-checkout.js";
let unexpectedNetwork = 0;
globalThis.fetch = async () => { unexpectedNetwork++; throw new Error("Unexpected network in modal status test"); };
after(() => assert.equal(unexpectedNetwork, 0));
const source = readFileSync(new URL("../src/components/shop-details-modal.tsx", import.meta.url), "utf8");
const copyCode = source.slice(source.indexOf("  const t = {"), source.indexOf("  }[locale];") + "  }[locale];".length).replace("const t =", "return");
const copy = locale => new Function("locale", ts.transpileModule(copyCode, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText)(locale);
function handler(name, next, deps) {
  const snippet = source.slice(source.indexOf(`  const ${name} =`), source.indexOf(`  const ${next} =`));
  const code = ts.transpileModule(`${snippet}\nreturn ${name};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(deps), code)(...Object.values(deps));
}
for (const locale of ["en", "ar"]) {
  for (const state of ["captured", "unknown"]) test(`${locale} ${state} booking receipt has a neutral payment title`, async () => {
    const t=copy(locale), alerts=[];
    const deps={t,locale,selectedService:{id:"service-one"},selectedSpecialist:"employee-one",selectedSlot:"time",submitting:false,setSubmitting:()=>{},requireUser:async()=>({id:"customer-one"}),supabase:{rpc:async()=>({data:{id:"booking-one",status:"pending_payment"},error:null})},ANY_SPECIALIST:"any",shop:{branchId:"branch-one"},selectedProfileId:null,notifyBookingsChanged:()=>{},Alert:{alert:(...args)=>alerts.push(args)},onClose:()=>{},requestCheckout:async()=>{throw new CheckoutStateError("receipt notice",state);},PAYMENT_RETURN_URL:"mobileapp://bookings",openCheckout:async()=>assert.fail("No browser may open"),errorMessage:e=>e.message,CheckoutStateError};
    await handler("handleBookingConfirm","handlePackagePurchase",deps)();
    assert.equal(alerts[0][0],t.paymentStatus);
    assert.notEqual(alerts[0][0],t.bookingFailed);
  });
  test(`${locale} actual booking creation failure still has its booking title`, async () => {
    const t=copy(locale), alerts=[];
    const deps={t,locale,selectedService:{id:"service-one"},selectedSpecialist:"employee-one",selectedSlot:"time",submitting:false,setSubmitting:()=>{},requireUser:async()=>({id:"customer-one"}),supabase:{rpc:async()=>({data:null,error:new Error("slot unavailable")})},ANY_SPECIALIST:"any",shop:{branchId:"branch-one"},selectedProfileId:null,notifyBookingsChanged:()=>{},Alert:{alert:(...args)=>alerts.push(args)},onClose:()=>{},errorMessage:e=>e.message,CheckoutStateError};
    await handler("handleBookingConfirm","handlePackagePurchase",deps)();
    assert.equal(alerts[0][0],t.bookingFailed);
  });
  test(`${locale} package receipt is labelled payment status rather than booking failure`, async () => {
    const t=copy(locale),alerts=[];
    const deps={t,locale,submitting:false,setSubmitting:()=>{},requireUser:async()=>({id:"customer-one"}),preparePurchase:async()=>({id:"purchase-one"}),requestCheckout:async()=>{throw new CheckoutStateError("receipt notice","captured");},supabase:{},checkoutStorage:{},notifyBookingsChanged:()=>{},PAYMENT_RETURN_URL:"mobileapp://bookings",Alert:{alert:(...args)=>alerts.push(args)},errorMessage:e=>e.message,CheckoutStateError};
    await handler("handlePackagePurchase","handleMessageShop",deps)({id:"package-one"});
    assert.equal(alerts[0][0],t.paymentStatus);
  });
}
