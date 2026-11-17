import React from 'react'
import { CabecalhoPagina } from '../components/UI'

// Aba Reatividade (vazia, sem o nome RDA ao lado).
export const ReatividadePage: React.FC = () => {
  return (
    <div className="space-y-6 animate-fade-in">
      <CabecalhoPagina selo="LC PETRO" titulo="Reatividade" subtitulo="" />
    </div>
  )
}
