"use client";

import { useState, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import { Upload, FileUp, Loader2, CheckCircle2, AlertCircle, Users, BookOpen, Phone, User, Download, Plus, Edit2, Trash2, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthStore } from "@/store/authStore";
import { useSearchStore } from "@/store/searchStore";
import { StudentDetailsModal } from "@/components/students/StudentDetailsModal";

export default function StudentsPage() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [editStudent, setEditStudent] = useState<any | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { searchQuery } = useSearchStore();
  const queryClient = useQueryClient();

  const { data: students = [], isLoading, refetch } = useQuery({
    queryKey: ["students-all"],
    queryFn: async () => (await api.get("/students")).data,
  });

  const { data: batches = [] } = useQuery({
    queryKey: ["batches"],
    queryFn: async () => (await api.get("/batches")).data,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post("/students", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["students-all"] });
      setEditStudent(null);
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.put(`/students/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["students-all"] });
      setEditStudent(null);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/students/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["students-all"] });
      setDeleteConfirm(null);
    }
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setStatus(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setStatus(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const { data } = await api.post("/students/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setStatus({ type: "success", message: data.message });
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      refetch(); // Refresh the list
    } catch (error: any) {
      setStatus({
        type: "error",
        message: error.response?.data?.message || "Failed to upload file",
      });
    } finally {
      setUploading(false);
    }
  };

  const filteredStudents = useMemo(() => {
    if (!searchQuery) return students;
    const lowerSearch = searchQuery.toLowerCase();
    return students.filter((s: any) => 
      (s.name || "").toLowerCase().includes(lowerSearch) ||
      (s.email || "").toLowerCase().includes(lowerSearch) ||
      (s.batch?.name || "").toLowerCase().includes(lowerSearch)
    );
  }, [students, searchQuery]);

  const uniqueBatches = useMemo(() => {
    const batches = new Set(students.map((s: any) => s.batch?._id).filter(Boolean));
    return batches.size;
  }, [students]);

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto h-full">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-white">Student Directory</h1>
          <p className="text-neutral-400 text-sm mt-0.5">
            Manage your entire student roster, view assignments, and import data in bulk.
          </p>
        </div>
        <button
          onClick={() => setEditStudent({ name: "", batch: "", parentName: "", mobileNumber: "" })}
          className="flex items-center gap-2 px-4 py-2.5 brand-gradient text-black font-semibold rounded-xl hover:opacity-90 transition-opacity text-sm shadow-lg shadow-amber-500/20"
        >
          <Plus className="w-4 h-4" /> New Student
        </button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 shrink-0">
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 relative overflow-hidden group hover:border-amber-500/30 transition-colors">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs text-neutral-500 uppercase font-semibold tracking-wider mb-1">Total Students</p>
              <h3 className="text-3xl font-bold text-white">{students.length}</h3>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-amber-500" />
            </div>
          </div>
          <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <Users className="w-24 h-24 text-amber-500" />
          </div>
        </div>
        
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 relative overflow-hidden group hover:border-emerald-500/30 transition-colors">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs text-neutral-500 uppercase font-semibold tracking-wider mb-1">Active Batches</p>
              <h3 className="text-3xl font-bold text-white">{uniqueBatches}</h3>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-emerald-500" />
            </div>
          </div>
          <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <BookOpen className="w-24 h-24 text-emerald-500" />
          </div>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 hidden md:flex flex-col justify-center items-center text-center border-dashed border-2 hover:border-amber-500/50 transition-colors cursor-pointer group" onClick={() => fileInputRef.current?.click()}>
          <div className="w-10 h-10 rounded-full bg-neutral-800 group-hover:bg-amber-500/20 flex items-center justify-center mb-2 transition-colors">
            <Upload className="w-4 h-4 text-neutral-400 group-hover:text-amber-500 transition-colors" />
          </div>
          <p className="text-sm font-semibold text-white">Quick Import</p>
          <p className="text-xs text-neutral-500 mt-0.5">Upload .xlsx or .csv</p>
        </div>
      </div>

      {/* Bulk Upload Section */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shrink-0">
        <div className="p-5 border-b border-neutral-800 bg-neutral-800/20">
          <h3 className="font-semibold text-white flex items-center gap-2">
            <FileUp className="w-4 h-4 text-amber-500" /> Bulk Registration
          </h3>
        </div>
        <div className="p-5 md:p-6 flex flex-col md:flex-row gap-6 items-center">
          <div className="flex-1 w-full text-sm text-neutral-400">
            <p className="mb-2">Upload a spreadsheet to register multiple students at once. Ensure your file contains exactly these column headers:</p>
            <div className="flex flex-wrap gap-2">
              {['Name', 'Batch', 'Parent Name', 'Mobile Number'].map(header => (
                <span key={header} className="px-2.5 py-1 bg-neutral-800 border border-neutral-700 rounded-md text-xs font-mono text-neutral-300">
                  {header}
                </span>
              ))}
            </div>
          </div>
          
          <div className="w-full md:w-auto flex flex-col sm:flex-row gap-3 items-center shrink-0">
            <input
              type="file"
              accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
              onChange={handleFileChange}
              ref={fileInputRef}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full sm:w-auto px-5 py-2.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-xl text-sm font-medium text-white transition-colors flex items-center justify-center gap-2"
            >
              <FileUp className="w-4 h-4 text-amber-500" />
              {file ? <span className="truncate max-w-[150px]">{file.name}</span> : "Select File"}
            </button>
            <button
              onClick={handleUpload}
              disabled={!file || uploading}
              className="w-full sm:w-auto px-6 py-2.5 brand-gradient text-black font-bold rounded-xl text-sm hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {uploading ? "Importing..." : "Run Import"}
            </button>
          </div>
        </div>
        
        <AnimatePresence>
          {status && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="px-6 pb-6"
            >
              <div className={`p-4 rounded-xl flex items-center gap-3 border ${
                status.type === "success" 
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" 
                  : "bg-red-500/10 border-red-500/20 text-red-400"
              }`}>
                {status.type === "success" ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
                <p className="text-sm font-medium">{status.message}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Roster Table */}
      <div className="flex-1 bg-neutral-900 border border-neutral-800 rounded-2xl flex flex-col min-h-[400px] overflow-hidden">
        <div className="p-5 border-b border-neutral-800 flex items-center justify-between">
          <h3 className="font-semibold text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-emerald-500" /> Student Roster
          </h3>
          {searchQuery && (
            <span className="text-xs font-medium px-2.5 py-1 bg-amber-500/10 text-amber-500 rounded-lg border border-amber-500/20">
              Found {filteredStudents.length} matches
            </span>
          )}
        </div>
        
        <div className="flex-1 overflow-y-auto p-0">
          {isLoading ? (
            <div className="h-full flex flex-col items-center justify-center text-neutral-500">
              <Loader2 className="w-8 h-8 animate-spin text-amber-500 mb-4" />
              <p className="text-sm">Loading student directory...</p>
            </div>
          ) : students.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8">
              <div className="w-16 h-16 bg-neutral-800 rounded-full flex items-center justify-center mb-4">
                <Users className="w-8 h-8 text-neutral-600" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">No Students Found</h3>
              <p className="text-neutral-400 text-sm max-w-sm mb-6">Your roster is currently empty. Use the quick import tool above to bulk upload your students.</p>
              <button onClick={() => fileInputRef.current?.click()} className="px-5 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white text-sm font-medium rounded-xl transition-colors">
                Select Excel File
              </button>
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 text-neutral-500">
              <AlertCircle className="w-10 h-10 text-neutral-700 mb-3" />
              <p>No students match your search query.</p>
            </div>
          ) : (
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-neutral-950/50 border-b border-neutral-800 text-neutral-400 sticky top-0 backdrop-blur-md z-10">
                <tr>
                  <th className="px-6 py-4 font-medium">Student Profile</th>
                  <th className="px-6 py-4 font-medium">Enrolled Batch</th>
                  <th className="px-6 py-4 font-medium">Parent / Guardian</th>
                  <th className="px-6 py-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/50">
                {filteredStudents.map((student: any) => (
                  <tr key={student._id} className="hover:bg-neutral-800/30 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <div className="w-10 h-10 rounded-full brand-gradient flex items-center justify-center text-sm font-bold text-black shrink-0">
                            {student.name.charAt(0)}
                          </div>
                          <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-emerald-500 border-2 border-neutral-900 rounded-full"></div>
                        </div>
                        <div className="flex flex-col">
                          <span className="font-semibold text-white">{student.name}</span>
                          <span className="text-xs text-neutral-500 flex items-center gap-1 mt-0.5">
                            <User className="w-3 h-3" /> Student
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-semibold shadow-[0_0_10px_rgba(245,158,11,0.05)]">
                        {student.batch?.name || "Unassigned"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-neutral-300 font-medium">{student.parentName || "—"}</span>
                        <span className="text-xs text-neutral-500 flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3" /> {student.mobileNumber || "—"}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => setSelectedStudentId(student._id)}
                          className="px-3 py-1.5 hover:bg-neutral-800 rounded-lg text-neutral-400 hover:text-white transition-colors text-xs font-medium"
                        >
                          View Details
                        </button>
                        <button 
                          onClick={() => setEditStudent({ ...student, batch: student.batch?._id || "" })}
                          className="p-1.5 hover:bg-amber-500/10 rounded-lg text-neutral-500 hover:text-amber-400 transition-colors"
                          title="Edit / Reassign Batch"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => setDeleteConfirm(student._id)}
                          className="p-1.5 hover:bg-red-500/10 rounded-lg text-neutral-500 hover:text-red-400 transition-colors"
                          title="Remove Student"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <AnimatePresence>
        {selectedStudentId && (
          <StudentDetailsModal 
            studentId={selectedStudentId} 
            onClose={() => setSelectedStudentId(null)} 
          />
        )}

        {editStudent && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-neutral-900 border border-neutral-700 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-5 border-b border-neutral-800 flex items-center justify-between bg-neutral-800/30">
                <h3 className="font-semibold text-white">
                  {editStudent._id ? "Edit Student Profile" : "Add New Student"}
                </h3>
                <button onClick={() => setEditStudent(null)} className="p-2 text-neutral-500 hover:text-white rounded-lg transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-1.5 block">Student Name</label>
                  <input
                    type="text"
                    value={editStudent.name || ""}
                    onChange={(e) => setEditStudent({ ...editStudent, name: e.target.value })}
                    className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:border-amber-500 text-sm"
                    placeholder="Enter student name"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                    <span>Batch Assignment</span>
                    {editStudent._id && <span className="text-[10px] text-amber-500 font-bold bg-amber-500/10 px-2 py-0.5 rounded">Promote / Advance</span>}
                  </label>
                  <select
                    value={editStudent.batch || ""}
                    onChange={(e) => setEditStudent({ ...editStudent, batch: e.target.value })}
                    className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:border-amber-500 text-sm"
                  >
                    <option value="">Select a batch</option>
                    {batches.map((b: any) => (
                      <option key={b._id} value={b._id}>{b.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-1.5 block">Parent Name</label>
                  <input
                    type="text"
                    value={editStudent.parentName || ""}
                    onChange={(e) => setEditStudent({ ...editStudent, parentName: e.target.value })}
                    className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:border-amber-500 text-sm"
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-1.5 block">Mobile Number</label>
                  <input
                    type="text"
                    value={editStudent.mobileNumber || ""}
                    onChange={(e) => setEditStudent({ ...editStudent, mobileNumber: e.target.value })}
                    className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:border-amber-500 text-sm"
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                    <span>WhatsApp Number</span>
                    <span className="text-[10px] text-emerald-500 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded">NEW</span>
                  </label>
                  <input
                    type="text"
                    value={editStudent.whatsappNumber || ""}
                    onChange={(e) => setEditStudent({ ...editStudent, whatsappNumber: e.target.value })}
                    className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:border-emerald-500 text-sm"
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                    <span>Email Address</span>
                    <span className="text-[10px] text-blue-500 font-bold bg-blue-500/10 px-1.5 py-0.5 rounded">NEW</span>
                  </label>
                  <input
                    type="email"
                    value={editStudent.email || ""}
                    onChange={(e) => setEditStudent({ ...editStudent, email: e.target.value })}
                    className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:border-blue-500 text-sm"
                    placeholder="student@example.com"
                  />
                </div>
              </div>
              <div className="p-5 border-t border-neutral-800 flex justify-end gap-3 bg-neutral-800/30">
                <button onClick={() => setEditStudent(null)} className="px-4 py-2 text-sm font-medium text-neutral-400 hover:text-white transition-colors">Cancel</button>
                <button 
                  onClick={() => {
                    if (editStudent._id) {
                      updateMutation.mutate({ id: editStudent._id, data: editStudent });
                    } else {
                      createMutation.mutate(editStudent);
                    }
                  }}
                  disabled={createMutation.isPending || updateMutation.isPending || !editStudent.name || !editStudent.batch}
                  className="px-4 py-2 brand-gradient text-black text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
                >
                  {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-4 h-4 animate-spin" />}
                  Save Student
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {deleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-neutral-900 border border-red-500/30 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden flex flex-col p-6 text-center"
            >
              <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/20">
                <Trash2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Remove Student?</h3>
              <p className="text-neutral-400 text-sm mb-6">
                Are you sure you want to completely remove this student from the directory? This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setDeleteConfirm(null)} className="flex-1 px-4 py-2 bg-neutral-800 text-white rounded-lg text-sm font-medium hover:bg-neutral-700 transition-colors">
                  Cancel
                </button>
                <button 
                  onClick={() => deleteMutation.mutate(deleteConfirm)}
                  disabled={deleteMutation.isPending}
                  className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-bold hover:bg-red-600 transition-colors flex items-center justify-center gap-2"
                >
                  {deleteMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  Remove
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
