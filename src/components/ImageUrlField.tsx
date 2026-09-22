import { useEffect, useState } from 'react'
import { Field, Input, cx } from './ui'
import { isFragileHost, isSafeImageUrl, normalizeImageUrl } from '../lib/imageUrl'

type Status = 'vazio' | 'carregando' | 'ok' | 'falhou' | 'inseguro'

/**
 * Campo de link de imagem com pré-visualização.
 *
 * A pré-visualização não é enfeite: é o único jeito de quem publica descobrir
 * na hora que o link não serve uma imagem. Sem ela, o erro só aparece para a
 * guild depois de publicado.
 */
export function ImageUrlField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [status, setStatus] = useState<Status>('vazio')
  const normalized = normalizeImageUrl(value)

  useEffect(() => {
    if (!normalized) {
      setStatus('vazio')
      return
    }
    if (!isSafeImageUrl(normalized)) {
      setStatus('inseguro')
      return
    }

    setStatus('carregando')

    // Carrega fora da árvore para poder distinguir sucesso de falha; um <img>
    // no DOM com onError já teria piscado um ícone quebrado.
    let cancelled = false
    const probe = new Image()
    probe.onload = () => !cancelled && setStatus('ok')
    probe.onerror = () => !cancelled && setStatus('falhou')
    probe.src = normalized

    return () => {
      cancelled = true
      probe.onload = null
      probe.onerror = null
    }
  }, [normalized])

  return (
    <Field
      label="Imagem (opcional)"
      hint="Cole o link de uma print. Link do Google Drive é convertido automaticamente."
    >
      <Input
        type="url"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://…"
        maxLength={500}
      />

      {status === 'inseguro' && (
        <p className="mt-1.5 text-xs text-red-400">O link precisa começar com https://</p>
      )}

      {status === 'carregando' && <p className="mt-1.5 text-xs text-zinc-500">Testando o link…</p>}

      {status === 'falhou' && (
        <p className="mt-1.5 text-xs text-red-400">
          Este link não carregou como imagem. Se for do Google Drive, confira se o arquivo está
          compartilhado como <span className="text-zinc-300">"qualquer pessoa com o link"</span>.
        </p>
      )}

      {status === 'ok' && (
        <div className="mt-2">
          <img
            src={normalized}
            alt=""
            className="max-h-48 w-full rounded-lg border border-zinc-800 object-contain"
          />
          <p
            className={cx(
              'mt-1 text-xs',
              isFragileHost(value) ? 'text-amber-400/80' : 'text-emerald-400',
            )}
          >
            {isFragileHost(value)
              ? 'Carregou. Atenção: links do Drive podem parar de funcionar sem aviso e têm limite de tráfego.'
              : 'Link válido.'}
          </p>
        </div>
      )}
    </Field>
  )
}
