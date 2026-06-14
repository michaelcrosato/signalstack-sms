const productContactImportDefaultItems = {
  filename: "product-contacts.csv",
  csv: `phone,email,first_name,last_name,consent_status,opt_in_source,tags,lists
+15555550155,casey@example.com,Casey,Rivera,OPTED_IN,demo_form,webinar,Demo Leads`
} as const;

export const productContactImportDefaults = Object.freeze({ ...productContactImportDefaultItems });
