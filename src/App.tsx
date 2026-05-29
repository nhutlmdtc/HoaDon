import React, { useState, useEffect, useRef } from "react";
import { 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  Upload, 
  LogIn, 
  LogOut, 
  Database, 
  Plus, 
  Building2, 
  DollarSign, 
  Sparkles, 
  Clock, 
  ArrowRightLeft, 
  ExternalLink,
  Loader2,
  Trash2,
  FileCheck2,
  Info
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { User } from "firebase/auth";
import { initAuth, googleSignIn, logout } from "./auth";
import { findSpreadsheet, createSpreadsheet, saveInvoiceToSheet } from "./sheets";
import { InvoiceData } from "./types";
import { compressImage } from "./utils";

export default function App() {
  // Authentication states
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Spreadsheet states
  const [spreadsheetId, setSpreadsheetId] = useState<string>("");
  const [spreadsheetUrl, setSpreadsheetUrl] = useState<string>("");
  const [isSearchingSheet, setIsSearchingSheet] = useState(false);
  const [isCreatingSheet, setIsCreatingSheet] = useState(false);

  // File states
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [displaySize, setDisplaySize] = useState<number>(0);
  const [isCompressed, setIsCompressed] = useState<boolean>(false);
  
  // Processing states
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingError, setProcessingError] = useState<string | null>(null);

  // Extracted invoice form data
  const [invoiceForm, setInvoiceForm] = useState<InvoiceData | null>(null);

  // Saving states
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ success: boolean; message: string } | null>(null);

  // Session activity log
  const [savedInvoices, setSavedInvoices] = useState<InvoiceData[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize Auth listeners on mount
  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, token) => {
        setUser(currentUser);
        setAccessToken(token);
        setNeedsAuth(false);
        if (token) {
          lookupUserSpreadsheet(token);
        }
      },
      () => {
        setUser(null);
        setAccessToken(null);
        setNeedsAuth(true);
      }
    );
    return () => unsubscribe();
  }, []);

  // Sync / find Spreadsheet when logged in
  const lookupUserSpreadsheet = async (token: string) => {
    setIsSearchingSheet(true);
    try {
      const sheet = await findSpreadsheet(token);
      if (sheet) {
        setSpreadsheetId(sheet.id);
        setSpreadsheetUrl(sheet.webViewLink);
      }
    } catch (err: any) {
      console.error("Error looking up spreadsheet:", err);
    } finally {
      setIsSearchingSheet(false);
    }
  };

  const handleLogin = async () => {
    setIsLoggingIn(true);
    setProcessingError(null);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setAccessToken(result.accessToken);
        setNeedsAuth(false);
        await lookupUserSpreadsheet(result.accessToken);
      }
    } catch (err: any) {
      console.error("Login failed:", err);
      setProcessingError(err.message || "Đăng nhập Google thất bại.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      setUser(null);
      setAccessToken(null);
      setNeedsAuth(true);
      setSpreadsheetId("");
      setSpreadsheetUrl("");
      setInvoiceForm(null);
      setSelectedFile(null);
      setFileBase64(null);
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  const handleCreateNewSpreadsheet = async () => {
    if (!accessToken) return;
    setIsCreatingSheet(true);
    setProcessingError(null);
    try {
      const config = await createSpreadsheet(accessToken);
      setSpreadsheetId(config.spreadsheetId);
      setSpreadsheetUrl(config.spreadsheetUrl);
    } catch (err: any) {
      setProcessingError(`Không thể tạo Bảng tính mới: ${err.message}`);
    } finally {
      setIsCreatingSheet(false);
    }
  };

  // Drag and drop events
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const processUploadedFile = async (file: File) => {
    if (!file) return;

    // Validate size and format
    const validTypes = ["application/pdf", "image/png", "image/jpeg", "image/jpg"];
    if (!validTypes.includes(file.type)) {
      setProcessingError("Vui lòng tải lên tài liệu PDF hoặc hình ảnh hóa đơn (PNG, JPEG, JPG).");
      return;
    }

    if (file.size > 20 * 1024 * 1024) { // 20MB limit
      setProcessingError("Dung lượng file tối đa là 20MB.");
      return;
    }

    setSelectedFile(file);
    setProcessingError(null);
    setSaveStatus(null);
    setDisplaySize(file.size);
    setIsCompressed(false);

    // If it's an image, compress on the frontend to optimize request size & Gemini API token count
    if (file.type.startsWith("image/")) {
      try {
        const { base64, compressedSize } = await compressImage(file);
        setFileBase64(base64);
        setDisplaySize(compressedSize);
        setIsCompressed(true);
      } catch (err: any) {
        console.warn("Nén ảnh thất bại, sử dụng ảnh gốc:", err);
        // Fallback to original
        const reader = new FileReader();
        reader.onload = () => {
          const resultStr = reader.result as string;
          const base64Data = resultStr.split(",")[1];
          setFileBase64(base64Data);
        };
        reader.readAsDataURL(file);
      }
    } else {
      // PDF - read directly
      const reader = new FileReader();
      reader.onload = () => {
        const resultStr = reader.result as string;
        const base64Data = resultStr.split(",")[1];
        setFileBase64(base64Data);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processUploadedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processUploadedFile(e.target.files[0]);
    }
  };

  const handleClearFile = () => {
    setSelectedFile(null);
    setFileBase64(null);
    setDisplaySize(0);
    setIsCompressed(false);
    setInvoiceForm(null);
    setProcessingError(null);
    setSaveStatus(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // call server-side endpoint with our base64 data
  const handleAnalyzeInvoice = async () => {
    if (!fileBase64 || !selectedFile) return;
    setIsProcessing(true);
    setProcessingError(null);
    setInvoiceForm(null);

    try {
      const response = await fetch("/api/process-invoice", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          fileData: fileBase64,
          mimeType: selectedFile.type
        })
      });

      const resJson = await response.json();
      if (!response.ok) {
        throw new Error(resJson.error || "Không thể phân tích tệp.");
      }

      const rawInvoice = resJson.data;

      // Map processing statistics & set defaults
      const mappedInvoice: InvoiceData = {
        ...rawInvoice,
        pdf_link: "", // Placeholder for explicit Link PDF input
        processed_date: new Date().toLocaleString("vi-VN"),
        processed_by: user?.email || user?.displayName || "Hệ thống"
      };

      setInvoiceForm(mappedInvoice);
    } catch (err: any) {
      console.error(err);
      setProcessingError(`Lỗi phân tích AI: ${err.message || "Rất tiếc, đã xảy ra sự cố trong quá trình OCR bằng Gemini."}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Form field modification handler
  const handleFieldChange = (field: keyof InvoiceData, value: string) => {
    if (!invoiceForm) return;
    setInvoiceForm({
      ...invoiceForm,
      [field]: value
    });
  };

  // Submit to Sheets Action
  const handleSaveToSheets = async () => {
    if (!invoiceForm || !accessToken) return;
    
    // Ensure spreadsheet is set up
    let targetSpreadsheetId = spreadsheetId;
    setIsSaving(true);
    setSaveStatus(null);

    try {
      // 1. If spreadsheet is not yet matched or created, create it automatically!
      if (!targetSpreadsheetId) {
        const config = await createSpreadsheet(accessToken);
        targetSpreadsheetId = config.spreadsheetId;
        setSpreadsheetId(config.spreadsheetId);
        setSpreadsheetUrl(config.spreadsheetUrl);
      }

      // 2. Save active row
      await saveInvoiceToSheet(accessToken, targetSpreadsheetId, invoiceForm);

      // 3. Success state
      setSaveStatus({
        success: true,
        message: `Đã lưu thành công dữ liệu hóa đơn số "${invoiceForm.invoice_number}" vào Trang tính "${invoiceForm.invoice_type === "Đầu ra" ? "Hóa đơn Đầu ra" : "Hóa đơn Đầu vào"}"!`
      });

      // Maintain session history
      setSavedInvoices([invoiceForm, ...savedInvoices]);
      
      // Keep invoice form but notify success
    } catch (err: any) {
      console.error("Error saving row:", err);
      setSaveStatus({
        success: false,
        message: `Lỗi lưu trữ: ${err.message || "Không thể lưu vào Google Sheets"}`
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] font-sans text-slate-800 flex flex-col">
      {/* Main Container */}
      <div className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 flex flex-col gap-6">
        
        {/* Header Bar - Geometric Balance layout */}
        <header className="h-16 bg-white border border-slate-200 rounded-2xl flex items-center justify-between px-6 sm:px-8 shrink-0 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-600 rounded-md flex items-center justify-center text-white">
              <FileCheck2 className="w-5 h-5" />
            </div>
            <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-2">
              <span className="font-bold text-slate-800 text-lg tracking-tight">InvoiceSheet Automator</span>
              <span className="text-[11px] text-slate-400 font-medium">Hóa đơn Đầu vào & Đầu ra</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:flex items-center gap-1.5">
              <span>Hệ thống:</span>
              <span className="text-emerald-600 font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                Connected
              </span>
            </div>
            
            {user ? (
              <div className="flex items-center space-x-3 bg-slate-50 p-1.5 pr-4 rounded-full border border-slate-200">
                {user.photoURL ? (
                  <img src={user.photoURL} alt="Avatar" className="w-6 h-6 rounded-full shadow-inner" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-emerald-600 flex items-center justify-center text-white font-bold text-[10px]">
                    {user.email?.[0].toUpperCase()}
                  </div>
                )}
                <div className="text-left hidden sm:block">
                  <p className="text-xs font-semibold text-slate-700 truncate max-w-[120px]">{user.displayName || "Kế toán viên"}</p>
                </div>
                <button 
                  onClick={handleLogout}
                  className="p-1 px-2.5 text-[10px] text-slate-500 bg-slate-200/60 hover:bg-red-50 hover:text-red-600 rounded-full transition-colors flex items-center gap-1 cursor-pointer"
                  title="Đăng xuất"
                >
                  <LogOut className="w-3 h-3" />
                  <span>Thoát</span>
                </button>
              </div>
            ) : (
              <div className="w-8 h-8 rounded-full bg-slate-200"></div>
            )}
          </div>
        </header>

        {/* Company Info Ribbon - Clean, minimal & beautiful */}
        <div className="bg-gradient-to-r from-emerald-800 to-teal-900 text-white rounded-2xl py-3 px-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3 shadow-sm border border-emerald-950/20">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-full bg-emerald-700/60 flex items-center justify-center border border-emerald-600/30">
              <Building2 className="w-3.5 h-3.5 text-emerald-300" />
            </div>
            <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-2">
              <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-300">Đơn vị sở hữu:</span>
              <span className="text-xs font-bold text-white tracking-wide">CÔNG TY CỔ PHẦN ĐẦU TƯ XÂY DỰNG VIỄN THÔNG ĐỒNG THÁP</span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs shrink-0 pl-8 md:pl-0">
            <span className="px-2.5 py-0.5 bg-emerald-700/60 text-emerald-250 rounded-md border border-emerald-600/40 font-mono text-[11px] font-bold">
              MST: 1400478233
            </span>
          </div>
        </div>

        {/* Global Error Banner */}
        {processingError && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 flex items-start space-x-3 shadow-sm"
          >
            <AlertCircle className="w-5 h-5 mt-0.5 text-red-600 shrink-0" />
            <div>
              <p className="font-bold text-sm">Phát hiện sự cố:</p>
              <p className="text-xs text-red-700 font-medium mt-0.5 whitespace-pre-line">{processingError}</p>
            </div>
          </motion.div>
        )}

        {/* Dynamic Main Workspace Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start flex-1">
          
          {/* STAGE 1: Authentication & Worksheet Configuration (Left Panel - 4 spans) */}
          <div className="col-span-1 lg:col-span-4 space-y-6">
            
            {/* GOOGLE LOG IN PORTLET */}
            {needsAuth ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 left-0 w-[4px] h-full bg-emerald-600" />
                <h2 className="text-sm font-bold text-slate-800 mb-2 flex items-center gap-2 uppercase tracking-wide">
                  <LogIn className="w-4 h-4 text-emerald-600" />
                  Mở khóa tính năng
                </h2>
                <p className="text-xs text-slate-500 mb-6 leading-relaxed">
                  Đăng nhập qua Tài khoản Google để kích hoạt tính năng tự động ghi dữ liệu vào Google Sheets và quản lý hóa đơn.
                </p>

                <button 
                  id="btn_google_signin"
                  onClick={handleLogin}
                  disabled={isLoggingIn}
                  className="w-full flex items-center justify-center space-x-3 bg-white border border-slate-200 p-3 rounded-xl hover:bg-slate-50 hover:border-slate-300 active:bg-slate-100 disabled:opacity-50 transition-all font-bold text-slate-700 shadow-sm cursor-pointer text-xs"
                >
                  {isLoggingIn ? (
                    <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
                  ) : (
                    <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-4 h-4 shrink-0">
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                    </svg>
                  )}
                  <span>{isLoggingIn ? "Đang tiến hành..." : "Đăng nhập với Google"}</span>
                </button>
              </div>
            ) : (
              /* CONNECTED SPREADSHEET MANAGER */
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 left-0 w-[4px] h-full bg-emerald-500" />
                <h2 className="text-sm font-bold text-slate-800 mb-2 flex items-center gap-2 uppercase tracking-wide">
                  <Database className="w-4 h-4 text-emerald-600" />
                  Bảng Tính Đồng Bộ
                </h2>
                <p className="text-xs text-slate-500 mb-6 leading-relaxed">
                  Mọi hóa đơn sau khi xác thực sẽ tự động được ghi nhận thành hai loại trong bảng tính này.
                </p>

                {isSearchingSheet ? (
                  <div className="flex flex-col items-center py-6">
                    <Loader2 className="w-8 h-8 animate-spin text-emerald-500 mb-2" />
                    <span className="text-xs text-slate-500">Đang tìm kiếm bảng "Quản lý Hóa đơn" trên Drive...</span>
                  </div>
                ) : spreadsheetId ? (
                  <div className="space-y-4">
                    {/* Status found card */}
                    <div className="p-3.5 bg-emerald-50 border border-emerald-100 rounded-xl text-emerald-950">
                      <div className="flex items-center space-x-2 text-emerald-800 font-bold text-sm">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>Đã liên kết bảng tính</span>
                      </div>
                      <p className="text-[11px] font-mono text-emerald-700 truncate mt-1">ID: {spreadsheetId}</p>
                    </div>

                    <a 
                      href={spreadsheetUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="w-full flex items-center justify-center space-x-2 p-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Truy cập Google Sheets</span>
                    </a>
                  </div>
                ) : (
                  /* Create sheet option */
                  <div className="space-y-4">
                    <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl text-amber-900 text-xs leading-relaxed flex gap-2">
                      <Info className="w-4 h-4 mt-0.5 text-amber-600 shrink-0" />
                      <div>
                        Chưa tìm thấy bảng tính mang tên <strong className="text-amber-950 font-semibold">"Quản lý Hóa đơn"</strong> trên tài khoản Drive của bạn.
                      </div>
                    </div>

                    <button 
                      onClick={handleCreateNewSpreadsheet}
                      disabled={isCreatingSheet}
                      className="w-full flex items-center justify-center space-x-2 p-3 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm"
                    >
                      {isCreatingSheet ? (
                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                      ) : (
                        <Plus className="w-4 h-4" />
                      )}
                      <span>{isCreatingSheet ? "Đang xử lý tạo..." : "Khởi tạo Bảng tính mới"}</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* STAGE 2: UPLOAD INVOICE DRAG-DROP PORTLET */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <h2 className="text-sm font-bold text-slate-800 mb-2 flex items-center gap-2 uppercase tracking-wide">
                <Upload className="w-4 h-4 text-emerald-600" />
                Tải lên tài liệu
              </h2>
              <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                Kéo thả file hóa đơn dạng PDF hoặc ảnh chụp để hệ thống quét dữ liệu tự động.
              </p>

              {/* Dynamic Drag Zone */}
              <div 
                className={`relative border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
                  dragActive 
                    ? "border-emerald-500 bg-emerald-50/50 scale-[1.01]" 
                    : "border-slate-200 hover:border-emerald-400 hover:bg-slate-50/30"
                } ${selectedFile ? "border-emerald-500 bg-emerald-50/10" : ""}`}
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => !isProcessing && fileInputRef.current?.click()}
              >
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".pdf, image/png, image/jpeg, image/jpg"
                  className="hidden" 
                  disabled={isProcessing}
                />

                {!selectedFile ? (
                  <div className="flex flex-col items-center py-4">
                    <div className="p-3 bg-slate-50 text-slate-450 border border-slate-200 rounded-lg mb-3">
                      <Upload className="w-5 h-5 text-slate-600" />
                    </div>
                    <p className="text-xs font-bold text-slate-700">Kéo & Thả hoặc Click để chọn file</p>
                    <p className="text-[10px] text-slate-400 mt-1">Định dạng: PDF, JPG, PNG (Tối đa 20MB)</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center py-2">
                    <div className="p-3 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-lg mb-3">
                      <FileText className="w-5 h-5" />
                    </div>
                    <p className="text-xs font-bold text-slate-800 truncate max-w-full px-2" title={selectedFile.name}>
                      {selectedFile.name}
                    </p>
                    <div className="text-[10px] text-slate-500 mt-1 flex flex-col items-center gap-1">
                      {isCompressed ? (
                        <>
                          <span className="inline-flex items-center gap-1 text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-full text-[9px] border border-emerald-100">
                            <Sparkles className="w-2.5 h-2.5 text-emerald-500 animate-pulse" /> Đã nén tối ưu hóa AI
                          </span>
                          <span className="font-medium text-slate-400">
                            <span className="line-through">{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</span>
                            <span className="text-slate-400 mx-1">→</span>
                            <span className="text-emerald-700 font-bold">{(displaySize / (1024 * 1024)).toFixed(2)} MB</span>
                          </span>
                        </>
                      ) : (
                        <span className="font-medium text-slate-600">{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</span>
                      )}
                      <span className="text-slate-400 font-medium">Loại tệp: {selectedFile.type || "Không xác định"}</span>
                    </div>

                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleClearFile();
                      }}
                      className="mt-4 flex items-center space-x-1 p-1 px-2.5 text-[10px] font-bold text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer border border-red-200"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Xóa file</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Action trigger button */}
              {selectedFile && !invoiceForm && (
                <button 
                  onClick={handleAnalyzeInvoice}
                  disabled={isProcessing}
                  className="w-full mt-4 flex items-center justify-center space-x-2 p-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span className="animate-pulse">Đang trích xuất bằng AI...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Đọc thông tin hóa đơn bằng AI</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {/* QUICK SESSION HISTORY */}
            {savedInvoices.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                <div className="flex items-center justify-between pb-3 border-b border-slate-150 mb-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-850 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                    Lịch sử trong phiên
                  </h3>
                  <span className="p-0.5 px-2 bg-emerald-50 text-emerald-700 border border-emerald-100 text-[10px] font-bold rounded-full">
                    {savedInvoices.length} hàng
                  </span>
                </div>
                <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                  {savedInvoices.map((inv, idx) => (
                    <div key={idx} className="p-2.5 bg-slate-50 hover:bg-slate-100 rounded-lg text-xs flex justify-between items-center transition-colors border border-slate-100">
                      <div className="min-w-0 pr-2">
                        <p className="font-bold text-slate-800 truncate">Số: {inv.invoice_number}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{inv.invoice_date} • {inv.invoice_type}</p>
                      </div>
                      <span className={`shrink-0 p-0.5 px-2 rounded-md text-[10px] font-bold ${
                        inv.invoice_type === "Đầu vào" ? "bg-amber-50 text-amber-600 border border-amber-100" : "bg-emerald-50 text-emerald-600 border border-emerald-100"
                      }`}>
                        {inv.invoice_type}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>

          {/* STAGE 3: INTERACTIVE REVIEW & EDIT FORM (Right Panel - 8 spans) */}
          <div className="col-span-1 lg:col-span-8 h-full">
            <AnimatePresence mode="wait">
              
              {/* STATE A: Pre-upload state */}
              {!selectedFile && !isProcessing && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm flex flex-col items-center justify-center min-h-[500px]"
                >
                  <div className="w-12 h-12 bg-slate-50 rounded-lg flex items-center justify-center border border-slate-200 mb-4 text-slate-400">
                    <FileText className="w-6 h-6 text-slate-500" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-850 uppercase tracking-wide">Chưa có hóa đơn được tải lên</h3>
                  <p className="text-xs text-slate-550 max-w-md mx-auto leading-relaxed mt-2">
                    Nhập/tải file hóa đơn (PDF/Hình ảnh) ở bảng bên trái. Trí tuệ nhân tạo Gemini OCR sẽ phân tích biểu giá thuế suất, mã kiểm tra, bên bán, bên mua và hiển thị chi tiết số liệu tại khung giao diện này.
                  </p>
                </motion.div>
              )}

              {/* STATE B: Processing Loader */}
              {isProcessing && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm flex flex-col items-center justify-center min-h-[500px]"
                >
                  <div className="relative mb-6">
                    <div className="w-12 h-12 border-4 border-emerald-100 border-t-emerald-600 rounded-full animate-spin" />
                    <Sparkles className="w-4 h-4 text-emerald-600 absolute top-4 left-4 animate-pulse" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Mô hình AI đang bóc tách số liệu...</h3>
                  <p className="text-xs text-slate-400 max-w-sm leading-relaxed mb-4">
                    Ứng dụng kết nối Gemini 2.5 Flash OCR để tự động phân tích và tính tổng biên lai của bạn...
                  </p>
                  
                  <div className="space-y-1.5 max-w-xs text-left p-4 bg-slate-50 rounded-xl border border-slate-200 w-full">
                    <div className="flex items-center space-x-2 text-[10px] uppercase font-bold text-slate-500">
                      <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping animate-duration-1000" />
                      <span>Đang bóc tách OCR tài liệu</span>
                    </div>
                    <div className="flex items-center space-x-2 text-[10px] uppercase font-bold text-slate-500">
                      <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                      <span>Truy vấn MST Tổng cục Thuế</span>
                    </div>
                    <div className="flex items-center space-x-2 text-[10px] uppercase font-bold text-slate-500">
                      <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                      <span>Đối chiếu cộng tổng thanh toán</span>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* STATE C: Extracted Data Review Panel */}
              {invoiceForm && !isProcessing && (
                <motion.div 
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  className="bg-white rounded-2xl border border-slate-200 p-6 md:p-8 shadow-sm space-y-6"
                >
                  {/* Top Notification bar */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-slate-150 gap-4">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="p-1 px-2.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold rounded-lg uppercase tracking-wider">Xác thực thành công</span>
                        <span className="text-[11px] text-slate-400 font-medium">Bóc tách bằng Gemini LLM</span>
                      </div>
                      <h3 className="text-base font-bold text-slate-800 tracking-tight uppercase mt-1">Đối Soát Nội Dung Hóa Đơn</h3>
                    </div>

                    <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0">
                      <button 
                        onClick={() => handleFieldChange("invoice_type", "Đầu vào")}
                        className={`p-1.5 px-4 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                          invoiceForm.invoice_type === "Đầu vào" 
                            ? "bg-white text-emerald-750 border border-slate-200 shadow-sm font-extrabold" 
                            : "text-slate-500 hover:text-slate-900"
                        }`}
                      >
                        Hóa đơn Đầu vào
                      </button>
                      <button 
                        onClick={() => handleFieldChange("invoice_type", "Đầu ra")}
                        className={`p-1.5 px-4 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                          invoiceForm.invoice_type === "Đầu ra" 
                            ? "bg-white text-emerald-750 border border-slate-200 shadow-sm font-extrabold" 
                            : "text-slate-500 hover:text-slate-900"
                        }`}
                      >
                        Hóa đơn Đầu ra
                      </button>
                    </div>
                  </div>

                  {/* Form Layout Grid */}
                  <div className="space-y-6">

                    {/* SECTION 1: GENERAL SYSTEM INFO */}
                    <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200">
                      <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-slate-500" />
                        1. Thông tin hóa đơn & Pháp lý
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Số Hóa Đơn</label>
                          <input 
                            type="text"
                            value={invoiceForm.invoice_number}
                            onChange={(e) => handleFieldChange("invoice_number", e.target.value)}
                            className="w-full bg-white border border-slate-200 p-2 text-xs rounded-lg focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 font-bold text-slate-800"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Ngày Hóa Đơn</label>
                          <input 
                            type="text"
                            value={invoiceForm.invoice_date}
                            onChange={(e) => handleFieldChange("invoice_date", e.target.value)}
                            className="w-full bg-white border border-slate-200 p-2 text-xs rounded-lg focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 font-semibold text-slate-800"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Mẫu số - Ký hiệu</label>
                          <input 
                            type="text"
                            value={invoiceForm.invoice_series_symbol}
                            onChange={(e) => handleFieldChange("invoice_series_symbol", e.target.value)}
                            className="w-full bg-white border border-slate-200 p-2 text-xs rounded-lg focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 font-semibold text-slate-850"
                          />
                        </div>
                      </div>
                    </div>

                    {/* SECTION 2: SELLER INFO */}
                    <div className="p-4 rounded-xl border border-slate-200 bg-white">
                      <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-slate-500" />
                        2. Thông tin bên bán hàng
                      </h4>
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="md:col-span-1">
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Mã Số Thuế Bên Bán (MST)</label>
                            <input 
                              type="text"
                              value={invoiceForm.seller_tax_code}
                              onChange={(e) => handleFieldChange("seller_tax_code", e.target.value)}
                              className="w-full bg-white border border-slate-200 p-2 text-xs rounded-lg focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                            />
                          </div>
                          <div className="md:col-span-2">
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Tên Đơn Vị Bán</label>
                            <input 
                              type="text"
                              value={invoiceForm.seller_name}
                              onChange={(e) => handleFieldChange("seller_name", e.target.value)}
                              className="w-full bg-white border border-slate-200 p-2 text-xs rounded-lg focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 font-medium"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Địa Chỉ Bán Hàng</label>
                          <input 
                            type="text"
                            value={invoiceForm.seller_address}
                            onChange={(e) => handleFieldChange("seller_address", e.target.value)}
                            className="w-full bg-white border border-slate-200 p-2 text-xs rounded-lg focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 text-slate-650"
                          />
                        </div>
                      </div>
                    </div>

                    {/* SECTION 3: BUYER INFO */}
                    <div className="p-4 rounded-xl border border-slate-200 bg-white">
                      <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-slate-500" />
                        3. Thông tin bên mua hàng
                      </h4>
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="md:col-span-1">
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Mã Số Thuế Bên Mua (MST)</label>
                            <input 
                              type="text"
                              value={invoiceForm.buyer_tax_code}
                              onChange={(e) => handleFieldChange("buyer_tax_code", e.target.value)}
                              className="w-full bg-white border border-slate-200 p-2 text-xs rounded-lg focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                            />
                          </div>
                          <div className="md:col-span-2">
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Tên Đơn Vị Mua</label>
                            <input 
                              type="text"
                              value={invoiceForm.buyer_name}
                              onChange={(e) => handleFieldChange("buyer_name", e.target.value)}
                              className="w-full bg-white border border-slate-200 p-2 text-xs rounded-lg focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 font-medium"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Địa Chỉ Mua Hàng</label>
                          <input 
                            type="text"
                            value={invoiceForm.buyer_address}
                            onChange={(e) => handleFieldChange("buyer_address", e.target.value)}
                            className="w-full bg-white border border-slate-200 p-2 text-xs rounded-lg focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 text-slate-650"
                          />
                        </div>
                      </div>
                    </div>

                    {/* SECTION 4: FINANCIAL DETAILS */}
                    <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200">
                      <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-1.5">
                        <DollarSign className="w-3.5 h-3.5 text-slate-500" />
                        4. Giá trị giao dịch (Tổng tiền thanh toán)
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Tiền Chưa Thuế</label>
                          <input 
                            type="text"
                            value={invoiceForm.subtotal_amount}
                            onChange={(e) => handleFieldChange("subtotal_amount", e.target.value)}
                            className="w-full bg-white border border-slate-200 p-2 text-xs rounded-lg focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 font-mono text-slate-800"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Tiền Thuế GTGT</label>
                          <input 
                            type="text"
                            value={invoiceForm.vat_amount}
                            onChange={(e) => handleFieldChange("vat_amount", e.target.value)}
                            className="w-full bg-white border border-slate-200 p-2 text-xs rounded-lg focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 font-mono text-slate-800"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Tổng tiền (VND)</label>
                          <input 
                            type="text"
                            value={invoiceForm.total_amount}
                            onChange={(e) => handleFieldChange("total_amount", e.target.value)}
                            className="w-full bg-white border border-slate-300 p-2 text-xs rounded-lg focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 font-bold font-mono text-slate-900"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Hình Thức T.Toán</label>
                          <input 
                            type="text"
                            value={invoiceForm.payment_method}
                            onChange={(e) => handleFieldChange("payment_method", e.target.value)}
                            className="w-full bg-white border border-slate-200 p-2 text-xs rounded-lg text-slate-700"
                          />
                        </div>
                      </div>
                    </div>

                    {/* SECTION 5: NOTES & META */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Trạng thái xác thực</label>
                        <select 
                          value={invoiceForm.validation_status}
                          onChange={(e) => handleFieldChange("validation_status", e.target.value)}
                          className="w-full bg-white border border-slate-200 p-2 text-xs rounded-lg focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 font-bold"
                        >
                          <option value="Hợp lệ">✓ Hợp lệ</option>
                          <option value="Cần xác minh">⚠️ Cần xác minh</option>
                          <option value="Không hợp lệ">✗ Không hợp lệ</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Ghi Chú</label>
                        <input 
                          type="text"
                          value={invoiceForm.notes}
                          onChange={(e) => handleFieldChange("notes", e.target.value)}
                          className="w-full bg-white border border-slate-200 p-2 text-xs rounded-lg focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                          placeholder="Nhập ghi chú thêm..."
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Link File PDF hóa đơn</label>
                        <input 
                          type="text"
                          value={invoiceForm.pdf_link || ""}
                          onChange={(e) => handleFieldChange("pdf_link", e.target.value)}
                          className="w-full bg-white border border-slate-200 p-2 text-xs rounded-lg focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 font-mono"
                          placeholder="https://drive.google.com/..."
                        />
                      </div>
                    </div>

                  </div>

                  {/* Saving status alerts */}
                  {saveStatus && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className={`p-4 rounded-xl border flex items-start space-x-3 text-sm ${
                        saveStatus.success 
                          ? "bg-emerald-50 border-emerald-200 text-emerald-950" 
                          : "bg-red-50 border-red-200 text-red-950"
                      }`}
                    >
                      {saveStatus.success ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <p className="font-bold">{saveStatus.success ? "Lưu dữ liệu thành công!" : "Sự cố khi lưu"}</p>
                        <p className="text-xs mt-0.5">{saveStatus.message}</p>
                        {saveStatus.success && spreadsheetUrl && (
                          <a 
                            href={spreadsheetUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="mt-2 inline-flex items-center space-x-1 text-xs text-emerald-700 hover:text-emerald-900 font-bold underline"
                          >
                            <span>Mở Google Sheets</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    </motion.div>
                  )}

                  {/* Submission and Control Actions */}
                  <div className="flex flex-col sm:flex-row sm:justify-end gap-3 pt-4 border-t border-slate-200">
                    <button 
                      onClick={handleClearFile}
                      className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-755 font-bold text-xs rounded-xl transition-all cursor-pointer text-center border border-slate-250"
                    >
                      Hủy bỏ
                    </button>
                    <button 
                      onClick={handleSaveToSheets}
                      disabled={isSaving || needsAuth}
                      className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl flex items-center justify-center space-x-2 shadow-sm transition-all cursor-pointer"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-white" />
                          <span>Đang ghi chép vào Sheets...</span>
                        </>
                      ) : (
                        <>
                          <Database className="w-4 h-4" />
                          <span>Cập nhật & Lưu vào Google Sheets</span>
                        </>
                      )}
                    </button>
                  </div>

                  {needsAuth && (
                    <p className="text-center text-[10px] text-amber-600 font-medium">
                      ⚠️ Hãy Đăng nhập Google ở góc trái trước khi bấm Lưu trữ vào Google Sheets.
                    </p>
                  )}

                </motion.div>
              )}

            </AnimatePresence>
          </div>

        </div>

        {/* Global Footer - Geometric Balance layout */}
        <footer className="h-12 bg-white border border-slate-200 rounded-2xl px-6 md:px-8 flex items-center justify-between text-[11px] font-medium text-slate-400 shrink-0 shadow-sm mt-4">
          <div className="flex gap-6 uppercase tracking-wider">
            <span>Người xử lý: <strong>{invoiceForm?.processed_by || user?.displayName || "Admin_System"}</strong></span>
            <span>Ngày xử lý: <strong>{invoiceForm?.processed_date || new Date().toLocaleString("vi-VN")}</strong></span>
          </div>
          <div className="flex gap-4">
            <span>Version 2.4.0</span>
            <span className="text-slate-200">|</span>
            <span>© 2026 Automation Engine</span>
          </div>
        </footer>

      </div>
    </div>
  );
}
