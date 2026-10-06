import test from "node:test";import assert from "node:assert/strict";import fs from "node:fs";
const app=fs.readFileSync("src/App.jsx","utf8");
const direct=[
 ['sale','sales'],['product','products'],['category','categories'],['customer','customers'],
 ['supplier','suppliers'],['purchase','purchases'],['purchase_line','supplier-returns'],
 ['gift_card','gift-cards'],['employee','employees'],['online_order','online-orders']
];
test("phase 5 business apps route through one generic metadata workspace",()=>{
 for(const [objectKey,appKey] of direct) assert.match(app,new RegExp(`MetadataPageRuntime objectKey="${objectKey}" appKey="${appKey}"`));
});
test("phase 5 removes obsolete business page wrappers",()=>{
 for(const name of ["SalesPage","ProductsPage","CategoriesPage","CustomersPage","SuppliersPage","PurchasesPage","SupplierReturnsPage"]) assert.equal(app.includes(name),false,name);
});
test("phase 5 keeps no deleted wrapper imports",()=>{
 for(const path of ["pages/purchases/PurchasesPage","pages/returns/SupplierReturnsPage","pages/suppliers/SuppliersPage"]) assert.equal(app.includes(path),false,path);
});
