import React from 'react'
import { useSearchParams } from 'react-router-dom'
import { Building2, Database, Tags, Users } from 'lucide-react'
import { CabecalhoPagina } from '../components/UI'
import { useAuth } from '../context/AuthContext'
import { CatalogosPage } from './CatalogosPage'
import { EmpresasProjetosPage } from './EmpresasProjetosPage'
import { PrefixosCodigoPage } from './PrefixosCodigoPage'

// Seção "Laboratório": uma página só, com quatro abas.
//   Empresas & Projetos e Acessos -> só administrador (regra do banco: empresas, projetos e membros).
//   Catálogos & Ácidos            -> qualquer editor (regra do banco: litologias e sistemas ácidos).
//   Prefixos de código            -> qualquer editor (regra do banco: prefixos_codigo).
// Quem é editor sem ser administrador vê apenas as abas de catálogos e de prefixos.
export const AdministracaoPage: React.FC = () => {
  const { isAdmin } = useAuth()
  const [params, setParams] = useSearchParams()

  const abas = [
    ...(isAdmin ? [
      { chave: 'empresas', rotulo: 'Empresas & Projetos', icone: Building2 },
      { chave: 'acessos', rotulo: 'Acessos', icone: Users },
    ] : []),
    { chave: 'catalogos', rotulo: 'Catálogos & Ácidos', icone: Database },
    { chave: 'prefixos', rotulo: 'Prefixos de código', icone: Tags },
  ]
  const pedida = params.get('aba')
  const aba = abas.some((a) => a.chave === pedida) ? pedida : abas[0].chave

  return (
    <div className="space-y-6 animate-fade-in">
      <CabecalhoPagina
        selo="LC PETRO · Laboratório"
        titulo={isAdmin ? 'Administração' : 'Catálogos & Ácidos'}
        subtitulo={isAdmin
          ? 'Empresas, projetos, acessos dos usuários e catálogos compartilhados por todos os projetos'
          : 'Litologias e sistemas ácidos compartilhados por todos os projetos'}
      />

      {abas.length > 1 && (
        <div className="flex items-center gap-1 overflow-x-auto border-b border-[var(--color-neutral-300)]">
          {abas.map(({ chave, rotulo, icone: Icone }) => (
            <button key={chave} type="button" onClick={() => setParams({ aba: chave })}
              className={`aba ${aba === chave ? 'ativa' : ''}`}>
              <Icone size={15} /> {rotulo}
            </button>
          ))}
        </div>
      )}

      {aba === 'empresas' && <EmpresasProjetosPage embutida secao="empresas" />}
      {aba === 'acessos' && <EmpresasProjetosPage embutida secao="acessos" />}
      {aba === 'catalogos' && <CatalogosPage embutida />}
      {aba === 'prefixos' && <PrefixosCodigoPage />}
    </div>
  )
}
