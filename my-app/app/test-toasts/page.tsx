"use client";
import { toast } from "sonner";

export default function TestToastsPage() {
  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center px-6 py-8">
      <div className="w-full max-w-md mx-auto space-y-4">
        <h1 className="text-2xl font-bold text-white text-center mb-8">Toast Test Page</h1>
        
        <button
          onClick={() => toast.success("Success!", { description: "This is a success message" })}
          className="w-full h-12 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700"
        >
          Test Success Toast
        </button>
        
        <button
          onClick={() => toast.error("Error!", { description: "This is an error message" })}
          className="w-full h-12 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700"
        >
          Test Error Toast
        </button>
        
        <button
          onClick={() => toast.warning("Warning!", { description: "This is a warning message" })}
          className="w-full h-12 bg-yellow-600 text-white rounded-xl font-medium hover:bg-yellow-700"
        >
          Test Warning Toast
        </button>
        
        <button
          onClick={() => toast("Info", { description: "This is an info message" })}
          className="w-full h-12 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700"
        >
          Test Info Toast
        </button>
      </div>
    </div>
  );
}
