export interface InvoiceData {
  invoice_date: string;
  invoice_number: string;
  invoice_series_symbol: string;
  seller_tax_code: string;
  seller_name: string;
  seller_address: string;
  buyer_tax_code: string;
  buyer_name: string;
  buyer_address: string;
  subtotal_amount: string;
  vat_amount: string;
  total_amount: string;
  payment_method: string;
  validation_status: string;
  notes: string;
  invoice_type: "Đầu vào" | "Đầu ra";
  pdf_link?: string;
  processed_date?: string;
  processed_by?: string;
}

export interface SpreadsheetConfig {
  spreadsheetId: string;
  spreadsheetUrl: string;
}
