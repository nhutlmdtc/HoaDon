import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

let aiClient: GoogleGenAI | null = null;
function getGemini(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY environment variable is required. Please set it in Settings > Secrets.");
    }
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

async function generateContentWithRetry(ai: GoogleGenAI, params: any, maxRetries = 3, initialDelay = 1500): Promise<any> {
  // Try the requested model first, then fall back to highly stable alternatives if it experiences transient issues.
  const modelsToTry = [params.model, "gemini-flash-latest", "gemini-3.1-flash-lite"].filter(Boolean);
  let lastError: any = null;

  for (let m = 0; m < modelsToTry.length; m++) {
    const currentModel = modelsToTry[m];
    const isFallback = m > 0;
    
    if (isFallback) {
      console.warn(`[Gemini API Info] Falling back to stable model: ${currentModel}`);
    }

    const modelParams = { ...params, model: currentModel };

    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await ai.models.generateContent(modelParams);
        return response;
      } catch (err: any) {
        lastError = err;
        const status = err.status || err.code;
        const message = err.message || "";
        
        const is429 = 
          status === 429 || 
          message.includes("429") || 
          message.includes("RESOURCE_EXHAUSTED") || 
          message.includes("rate limit") || 
          message.includes("quota");

        const isTransient = 
          is429 ||
          status === 503 || 
          message.includes("503") || 
          message.includes("UNAVAILABLE") || 
          message.includes("high demand") || 
          message.includes("temporary");

        if (isTransient) {
          const isLastAttemptForThisModel = i === maxRetries - 1;
          const isLastModel = m === modelsToTry.length - 1;

          if (!isLastAttemptForThisModel) {
            let delay = initialDelay * Math.pow(1.5, i) + Math.random() * 500;
            if (is429) {
              // Increase wait time significantly for 429 rate limit errors to let the quota window reset of 60 seconds
              delay = 8000 * Math.pow(2.5, i) + Math.random() * 1000;
              console.warn(`[Gemini API Quota Check] Model ${currentModel} hit rate-limit/quota (429). Applying adaptive backoff of ${Math.round(delay)}ms...`);
            }
            console.warn(`[Gemini API Warning] Model ${currentModel} failed with transient error ${status || "UNAVAILABLE"} (attempt ${i + 1}/${maxRetries}). Retrying in ${Math.round(delay)}ms...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          } else {
            console.warn(`[Gemini API Warning] Model ${currentModel} exhausted all ${maxRetries} attempts due to transient error ${status || "UNAVAILABLE"}.`);
            if (!isLastModel) {
              // Wait for a short cooldown of 6 seconds before cascading to the next fallback model
              const cascadeCooldown = 5000 + Math.random() * 2000;
              console.warn(`[Gemini API Info] Waiting ${Math.round(cascadeCooldown)}ms before cascading to fallback model...`);
              await new Promise((resolve) => setTimeout(resolve, cascadeCooldown));
              // Break inner loop to cascade to next fallback model
              break;
            }
          }
        }
        // If it's a non-transient error (e.g. wrong format, invalid key), or the last fallback failed, throw it
        throw err;
      }
    }
  }
  throw lastError || new Error("Failed after exhausting all fallback models and retries");
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Set limits to accept large uploads of PDFs/images encoded in base64
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/process-invoice", async (req, res) => {
    try {
      const { fileData, mimeType } = req.body;
      if (!fileData || !mimeType) {
        return res.status(400).json({ error: "Missing fileData or mimeType" });
      }

      // Initialize Gemini client securely
      const ai = getGemini();

      const imageOrPdfPart = {
        inlineData: {
          data: fileData,
          mimeType: mimeType
        }
      };

      const systemInstruction = `
        Bạn là một trợ lý kế toán chuyên nghiệp Việt Nam, phục vụ riêng cho:
        CÔNG TY CỔ PHẦN ĐẦU TƯ XÂY DỰNG VIỄN THÔNG ĐỒNG THÁP
        Mã số thuế: 1400478233

        Nhiệm vụ của bạn là đọc và phân tích hóa đơn từ file ảnh hoặc PDF được cung cấp, trích xuất thông tin một cách cực kỳ chính xác thành định dạng JSON.
        Hãy chú ý đặc biệt đến các trường sau:
        - Ngày hóa đơn (định dạng DD/MM/YYYY)
        - Số hóa đơn (chuỗi hiển thị đầy đủ, ví dụ: '00000123')
        - Mẫu số - Ký hiệu (ví dụ: '1C23TUU' hoặc '1C21TML')
        - Mã số thuế (MST) của người bán và người mua (đây là số có 10 hoặc 13 chữ số)
        - Tên và địa chỉ của cả người bán và người mua
        - Tổng tiền chưa thuế, Thuế GTGT, Tổng tiền thanh toán (giữ nguyên số hoặc chuyển thành định dạng số chuỗi sạch không chứa ký tự tiền tệ)
        - Hình thức thanh toán (ví dụ: TM/CK, CK, TM, hoặc đối chiếu cụm từ trên hóa đơn)
        - Trạng thái xác thực (Mặc định đánh giá 'Hợp lệ' nếu cấu trúc hóa đơn đầy đủ thông tin pháp lý hợp lệ, hoặc 'Cần đối chiếu' nếu có thông tin khả nghi hoặc thiếu sót)
        - Ghi chú: Lưu ý đặc biệt hoặc thông tin thêm (ví dụ: thuế suất % cụ thể)
        - Phân loại (invoice_type): Hãy xác định xem hóa đơn này là "Đầu vào" hoặc "Đầu ra" dựa vào thông tin của công ty chủ sở hữu hệ thống:
          * Nếu bên MUA (Buyer) có Mã số thuế là "1400478233" hoặc Tên Đơn Vị Mua khớp/gần giống với "CÔNG TY CỔ PHẦN ĐẦU TƯ XÂY DỰNG VIỄN THÔNG ĐỒNG THÁP" -> Phân loại là "Đầu vào" (Vì công ty đang đi mua hàng).
          * Nếu bên BÁN (Seller) có Mã số thuế là "1400478233" hoặc Tên Đơn Vị Bán khớp/gần giống với "CÔNG TY CỔ PHẦN ĐẦU TƯ XÂY DỰNG VIỄN THÔNG ĐỒNG THÁP" -> Phân loại là "Đầu ra" (Vì công ty đang bán hàng).
          * Nếu không khớp bên nào hoặc chưa rõ ràng, mặc định nhập là "Đầu vào".
      `;

      const response = await generateContentWithRetry(ai, {
        model: "gemini-3.5-flash",
        contents: [
          imageOrPdfPart,
          { text: "Hãy đọc dữ liệu hóa đơn này và trả về kết quả JSON theo định dạng chuẩn đã yêu cầu." }
        ],
        config: {
          systemInstruction: systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              invoice_date: {
                type: Type.STRING,
                description: "Ngày hóa đơn dạng DD/MM/YYYY"
              },
              invoice_number: {
                type: Type.STRING,
                description: "Số hóa đơn chính xác"
              },
              invoice_series_symbol: {
                type: Type.STRING,
                description: "Mẫu số và ký hiệu hóa đơn"
              },
              seller_tax_code: {
                type: Type.STRING,
                description: "Mã số thuế Người bán"
              },
              seller_name: {
                type: Type.STRING,
                description: "Tên Công ty/Người bán"
              },
              seller_address: {
                type: Type.STRING,
                description: "Địa chỉ Người bán"
              },
              buyer_tax_code: {
                type: Type.STRING,
                description: "Mã số thuế Người mua"
              },
              buyer_name: {
                type: Type.STRING,
                description: "Tên Công ty/Người mua"
              },
              buyer_address: {
                type: Type.STRING,
                description: "Địa chỉ Người mua"
              },
              subtotal_amount: {
                type: Type.STRING,
                description: "Tổng tiền chưa thuế"
              },
              vat_amount: {
                type: Type.STRING,
                description: "Tiền thuế GTGT"
              },
              total_amount: {
                type: Type.STRING,
                description: "Tổng tiền thanh toán"
              },
              payment_method: {
                type: Type.STRING,
                description: "Hình thức thanh toán"
              },
              validation_status: {
                type: Type.STRING,
                description: "Trạng thái xác thực (ví dụ: Hợp lệ, Cần xác minh, v.v.)"
              },
              notes: {
                type: Type.STRING,
                description: "Ghi chú, ghi nhớ thông tin đặc biệt"
              },
              invoice_type: {
                type: Type.STRING,
                description: "Phân loại hóa đơn: 'Đầu vào' hoặc 'Đầu ra'"
              }
            },
            required: [
              "invoice_date",
              "invoice_number",
              "invoice_series_symbol",
              "seller_tax_code",
              "seller_name",
              "seller_address",
              "buyer_tax_code",
              "buyer_name",
              "buyer_address",
              "subtotal_amount",
              "vat_amount",
              "total_amount",
              "payment_method",
              "validation_status",
              "notes",
              "invoice_type"
            ]
          }
        }
      });

      const extractedText = response.text || "{}";
      const resultObj = JSON.parse(extractedText.trim());

      res.json({ success: true, data: resultObj });
    } catch (error: any) {
      console.error("Error processing invoice with Gemini:", error);
      let clientMessage = error.message || "Không thể phân tích hóa đơn lúc này.";
      const status = error.status || error.code || 500;
      
      if (
        status === 503 ||
        clientMessage.includes("503") ||
        clientMessage.includes("UNAVAILABLE") ||
        clientMessage.includes("high demand") ||
        clientMessage.includes("temporary")
      ) {
        clientMessage = "Hệ thống AI của Google hiện tại đang quá tải (Lỗi 503). Chế độ tự động gửi lại nhiều lần đã được thực hiện nhưng không thành công. Bạn vui lòng đợi 5-10 giây rồi bấm tải lên thử lại.";
      } else if (
        status === 429 ||
        clientMessage.includes("429") ||
        clientMessage.includes("RESOURCE_EXHAUSTED") ||
        clientMessage.includes("rate limit")
      ) {
        clientMessage = "Yêu cầu OCR hóa đơn đã vượt quá giới hạn lượt dùng thử hôm nay (Lỗi 429). Xin vui lòng đợi một phút rồi thử lại.";
      }
      
      res.status(500).json({ error: clientMessage });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
