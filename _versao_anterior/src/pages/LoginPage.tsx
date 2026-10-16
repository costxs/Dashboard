import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

export function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    navigate("/projetos");
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#f0f0f0] p-6 font-sans">
      <div className="w-full max-w-[420px] border-2 border-[#d0d0d0] p-8 sm:p-10 bg-white shadow-sm animate-[fadeIn_0.5s_ease-out]">
        <style>
          {`
            @keyframes fadeIn {
              from { opacity: 0; transform: translateY(10px); }
              to { opacity: 1; transform: translateY(0); }
            }
            .animate-stagger-1 { animation: fadeIn 0.5s ease-out 0.1s both; }
            .animate-stagger-2 { animation: fadeIn 0.5s ease-out 0.2s both; }
            .animate-stagger-3 { animation: fadeIn 0.5s ease-out 0.3s both; }
          `}
        </style>
        {/* Logos container */}
        <div className="flex items-center justify-center gap-6 mb-10">
          <div className="w-[150px] h-[85px] flex items-center justify-center">
            <img 
              src="/lab-logo-1.png" 
              alt="Logo Lab 1" 
              className="max-w-full max-h-full object-contain hover:scale-105 transition-transform duration-300"
            />
          </div>
          <div className="w-[1px] h-[75px] bg-[#d0d0d0]" />
          <div className="w-[150px] h-[85px] flex items-center justify-center">
            <img 
              src="/lab-logo-2.png" 
              alt="Logo Lab 2" 
              className="max-w-full max-h-full object-contain hover:scale-105 transition-transform duration-300"
            />
          </div>
        </div>

        {/* Title */}
        <h1 className="text-[26px] font-bold text-black mb-8 leading-tight tracking-tight">
          Bem vindo ao<br />
          Memória experimental
        </h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5 animate-stagger-1">
            <label htmlFor="username" className="text-sm font-normal text-slate-600 transition-colors">
              Usuário
            </label>
            <input
              id="username"
              name="username"
              type="text"
              required
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full h-11 px-3 border border-[#c0c0c0] bg-[#e6e6e6] text-black text-sm focus:outline-none focus:border-slate-500 focus:bg-white focus:-translate-y-0.5 focus:shadow-sm transition-all duration-300"
            />
          </div>
          <div className="flex flex-col gap-1.5 animate-stagger-2">
            <label htmlFor="password" className="text-sm font-normal text-slate-600 transition-colors">
              Senha
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-11 px-3 border border-[#c0c0c0] bg-[#e6e6e6] text-black text-sm focus:outline-none focus:border-slate-500 focus:bg-white focus:-translate-y-0.5 focus:shadow-sm transition-all duration-300"
            />
          </div>

          <button
            type="submit"
            className="mt-4 w-full h-11 bg-[#f0320a] hover:bg-[#e02b05] active:scale-[0.98] text-white font-semibold text-base flex items-center justify-center cursor-pointer transition-all duration-200 animate-stagger-3"
          >
            Entrar
          </button>
        </form>
      </div>
    </div>
  );
}
