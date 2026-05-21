import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { login as loginApi } from '@wish/api-client'
import { decodeJwt } from '../shared/auth/jwt'
import { useAuthStore } from '../shared/auth/store'

const loginSchema = z.object({
  email: z.string().email('올바른 이메일을 입력하세요'),
  password: z.string().min(1, '비밀번호를 입력하세요'),
})

type LoginForm = z.infer<typeof loginSchema>

export function LoginPage() {
  const navigate = useNavigate()
  const { setToken, clear, isAdmin, token } = useAuthStore()
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const { register, handleSubmit, formState } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  useEffect(() => {
    if (token && isAdmin) {
      navigate('/dashboard', { replace: true })
    }
  }, [token, isAdmin, navigate])

  const onSubmit = async (values: LoginForm) => {
    setError(null)
    setSubmitting(true)
    try {
      const response = await loginApi(values)
      const newToken = response.data.accessToken
      const payload = decodeJwt(newToken)
      if (payload?.role !== 'ADMIN') {
        // 토큰은 받았지만 ADMIN 이 아니면 저장하지 않고 거부.
        clear()
        setError('관리자 권한이 없는 계정입니다')
        return
      }
      setToken(newToken)
      navigate('/dashboard', { replace: true })
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? '이메일 또는 비밀번호가 올바르지 않습니다'
          : '로그인 중 오류가 발생했습니다'
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={styles.container}>
      <form onSubmit={handleSubmit(onSubmit)} style={styles.form}>
        <div style={styles.brand}>
          <span style={styles.brandMark}>W</span>
          <div>
            <strong style={styles.brandTitle}>WISH Admin</strong>
            <span style={styles.brandSub}>운영 콘솔</span>
          </div>
        </div>

        <label style={styles.label}>
          이메일
          <input
            type="email"
            autoComplete="email"
            {...register('email')}
            style={styles.input}
            disabled={submitting}
          />
          {formState.errors.email && (
            <span style={styles.error}>{formState.errors.email.message}</span>
          )}
        </label>

        <label style={styles.label}>
          비밀번호
          <input
            type="password"
            autoComplete="current-password"
            {...register('password')}
            style={styles.input}
            disabled={submitting}
          />
          {formState.errors.password && (
            <span style={styles.error}>{formState.errors.password.message}</span>
          )}
        </label>

        {error && <div style={styles.errorBox}>{error}</div>}

        <button type="submit" style={styles.submit} disabled={submitting}>
          {submitting ? '로그인 중…' : '로그인'}
        </button>
      </form>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f4f7f9',
    color: '#102a43',
  },
  form: {
    width: 380,
    padding: 32,
    background: '#fff',
    border: '1px solid #d9e2ec',
    borderRadius: 8,
    boxShadow: '0 8px 24px rgba(16, 42, 67, 0.06)',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
  },
  brandMark: {
    width: 38,
    height: 38,
    display: 'grid',
    placeItems: 'center',
    borderRadius: 8,
    background: '#0b7285',
    color: '#fff',
    fontSize: 18,
    fontWeight: 800,
  },
  brandTitle: {
    display: 'block',
    color: '#102a43',
    fontSize: 18,
    fontWeight: 800,
  },
  brandSub: {
    display: 'block',
    marginTop: 2,
    color: '#829ab1',
    fontSize: 12,
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    color: '#486581',
    fontSize: 13,
    fontWeight: 600,
  },
  input: {
    padding: '9px 10px',
    fontSize: 14,
    color: '#102a43',
    background: '#fff',
    border: '1px solid #bcccdc',
    borderRadius: 6,
  },
  error: { color: '#c92a2a', fontSize: 12, fontWeight: 500 },
  errorBox: {
    padding: 10,
    background: '#fff5f5',
    color: '#c92a2a',
    border: '1px solid #ffc9c9',
    borderRadius: 6,
    fontSize: 13,
  },
  submit: {
    height: 40,
    padding: '0 14px',
    fontSize: 14,
    fontWeight: 700,
    color: '#fff',
    background: '#0b7285',
    border: '1px solid #0b7285',
    borderRadius: 6,
    cursor: 'pointer',
  },
}
