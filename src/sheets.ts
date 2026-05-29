import { InvoiceData, SpreadsheetConfig } from "./types";

const GOOGLE_SHEETS_API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const GOOGLE_DRIVE_API_BASE = "https://www.googleapis.com/drive/v3/files";

const HEADERS = [
  "Ngày hóa đơn",
  "Số hóa đơn",
  "Mẫu số - Ký hiệu",
  "MST Người bán",
  "Tên Người bán",
  "Địa chỉ Người bán",
  "MST Người mua",
  "Tên Người mua",
  "Địa chỉ Người mua",
  "Tổng tiền chưa thuế",
  "Thuế GTGT",
  "Tổng tiền thanh toán",
  "Hình thức thanh toán",
  "Trạng thái xác thực",
  "Ghi chú",
  "Link file PDF",
  "Ngày xử lý",
  "Người xử lý"
];

// Search for an existing "Quản lý Hóa đơn" google spreadsheet in the user's Drive.
export async function findSpreadsheet(accessToken: string): Promise<{ id: string; webViewLink: string } | null> {
  const query = encodeURIComponent("name = 'Quản lý Hóa đơn' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false");
  const url = `${GOOGLE_DRIVE_API_BASE}?q=${query}&fields=files(id,name,webViewLink)&pageSize=1`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to search Drive: ${response.statusText}`);
  }

  const result = await response.json();
  if (result.files && result.files.length > 0) {
    return {
      id: result.files[0].id,
      webViewLink: result.files[0].webViewLink
    };
  }
  return null;
}

// Create a new spreadsheet and initialize the sheets "Hóa đơn Đầu vào" and "Hóa đơn Đầu ra".
export async function createSpreadsheet(accessToken: string): Promise<SpreadsheetConfig> {
  const spreadsheetBody = {
    properties: {
      title: "Quản lý Hóa đơn"
    }
  };

  const response = await fetch(GOOGLE_SHEETS_API_BASE, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(spreadsheetBody)
  });

  if (!response.ok) {
    throw new Error(`Failed to create spreadsheet: ${response.statusText}`);
  }

  const result = await response.json();
  const spreadsheetId = result.spreadsheetId;
  const spreadsheetUrl = result.spreadsheetUrl;

  // By default, Google Sheets creates a "Sheet1" (or "Trang tính 1").
  // We will rename the first sheet to "Hóa đơn Đầu vào" and add "Hóa đơn Đầu ra" in a batchUpdate request.
  const firstSheetId = result.sheets[0]?.properties?.sheetId || 0;

  const batchUpdateBody = {
    requests: [
      {
        updateSheetProperties: {
          properties: {
            sheetId: firstSheetId,
            title: "Hóa đơn Đầu vào"
          },
          fields: "title"
        }
      },
      {
        addSheet: {
          properties: {
            title: "Hóa đơn Đầu ra"
          }
        }
      }
    ]
  };

  const updateResponse = await fetch(`${GOOGLE_SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(batchUpdateBody)
  });

  if (!updateResponse.ok) {
    console.error("Failed to initialize sheets structure, falling back", await updateResponse.text());
  }

  return {
    spreadsheetId,
    spreadsheetUrl
  };
}

// Ensure "Hóa đơn Đầu vào" and "Hóa đơn Đầu ra" sheets exist inside the spreadsheet.
export async function verifyAndCreateSheets(accessToken: string, spreadsheetId: string): Promise<void> {
  const getUrl = `${GOOGLE_SHEETS_API_BASE}/${spreadsheetId}`;
  const response = await fetch(getUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to retrieve spreadsheet sheets structure: ${response.statusText}`);
  }

  const result = await response.json();
  const existingTitles: string[] = result.sheets.map((s: any) => s.properties.title);

  const requests: any[] = [];
  if (!existingTitles.includes("Hóa đơn Đầu vào")) {
    requests.push({
      addSheet: {
        properties: { title: "Hóa đơn Đầu vào" }
      }
    });
  }
  if (!existingTitles.includes("Hóa đơn Đầu ra")) {
    requests.push({
      addSheet: {
        properties: { title: "Hóa đơn Đầu ra" }
      }
    });
  }

  if (requests.length > 0) {
    const updateResponse = await fetch(`${GOOGLE_SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ requests })
    });
    if (!updateResponse.ok) {
      throw new Error(`Failed to create missing sheets: ${await updateResponse.text()}`);
    }
  }
}

// Check if a sheet is empty, and write headers if so.
async function ensureHeadersExist(accessToken: string, spreadsheetId: string, sheetName: string): Promise<void> {
  const encodedSheet = encodeURIComponent(sheetName);
  const rangeUrl = `${GOOGLE_SHEETS_API_BASE}/${spreadsheetId}/values/${encodedSheet}!A1:E2`;

  const response = await fetch(rangeUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    console.error(`Failed to verify headers in ${sheetName}:`, await response.text());
    return;
  }

  const result = await response.json();
  const hasValues = result.values && result.values.length > 0;

  if (!hasValues) {
    // Write headers
    const appendUrl = `${GOOGLE_SHEETS_API_BASE}/${spreadsheetId}/values/${encodedSheet}!A1:append?valueInputOption=USER_ENTERED`;
    const appendResponse = await fetch(appendUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        range: `${sheetName}!A1`,
        majorDimension: "ROWS",
        values: [HEADERS]
      })
    });

    if (!appendResponse.ok) {
      console.error(`Failed to write headers to ${sheetName}:`, await appendResponse.text());
    }
  }
}

// Save invoice to Google Sheets
export async function saveInvoiceToSheet(accessToken: string, spreadsheetId: string, invoice: InvoiceData): Promise<void> {
  // Determine sheet name
  const sheetName = invoice.invoice_type === "Đầu ra" ? "Hóa đơn Đầu ra" : "Hóa đơn Đầu vào";

  // Ensure standard sheet exists and has headers
  await verifyAndCreateSheets(accessToken, spreadsheetId);
  await ensureHeadersExist(accessToken, spreadsheetId, sheetName);

  const rowData = [
    invoice.invoice_date,
    invoice.invoice_number,
    invoice.invoice_series_symbol,
    invoice.seller_tax_code,
    invoice.seller_name,
    invoice.seller_address,
    invoice.buyer_tax_code,
    invoice.buyer_name,
    invoice.buyer_address,
    invoice.subtotal_amount,
    invoice.vat_amount,
    invoice.total_amount,
    invoice.payment_method,
    invoice.validation_status,
    invoice.notes,
    invoice.pdf_link || "",
    invoice.processed_date || new Date().toLocaleString("vi-VN", { timeZone: "UTC" }),
    invoice.processed_by || ""
  ];

  const encodedSheet = encodeURIComponent(sheetName);
  const appendUrl = `${GOOGLE_SHEETS_API_BASE}/${spreadsheetId}/values/${encodedSheet}!A1:append?valueInputOption=USER_ENTERED`;

  const response = await fetch(appendUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      range: `${sheetName}!A1`,
      majorDimension: "ROWS",
      values: [rowData]
    })
  });

  if (!response.ok) {
    const errorMsg = await response.text();
    throw new Error(`Failed to save row to Google Sheets: ${errorMsg}`);
  }
}
