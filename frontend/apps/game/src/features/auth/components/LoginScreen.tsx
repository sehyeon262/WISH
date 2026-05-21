import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { login as loginApi } from '@wish/api-client'
import { useAuthStore } from '../store'
import { extractAuthErrorMessage } from '../errors'
import { authStyles } from './authStyles'

const loginSchema = z.object({
  email: z.string().email('올바른 이메일을 입력하세요'),
  password: z.string().min(1, '비밀번호를 입력하세요'),
})

type LoginForm = z.infer<typeof loginSchema>

type LoginScreenProps = {
  onAuthSuccess: () => void
}

export function LoginScreen({ onAuthSuccess }: LoginScreenProps) {
  const setTokens = useAuthStore(state => state.setTokens)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const { register, handleSubmit, formState } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  const onSubmit = async (values: LoginForm) => {
    setError(null)
    setSubmitting(true)
    try {
      const response = await loginApi(values)
      // access + refresh 모두 저장. 인터셉터가 access 만료 시 자동 회전 (S14P31E103-780).
      setTokens(response.data.accessToken, response.data.refreshToken)
      onAuthSuccess()
    } catch (err) {
      setError(extractAuthErrorMessage(err, '이메일 또는 비밀번호가 올바르지 않습니다'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} style={authStyles.form}>
      <h2 style={authStyles.title}>로그인</h2>

      <label style={authStyles.label}>
        이메일
        <input
          type="email"
          autoComplete="email"
          className="auth-input"
          {...register('email')}
          style={authStyles.input}
          disabled={submitting}
        />
        {formState.errors.email && (
          <span style={authStyles.error}>{formState.errors.email.message}</span>
        )}
      </label>

      <label style={authStyles.label}>
        비밀번호
        <input
          type="password"
          autoComplete="current-password"
          className="auth-input"
          {...register('password')}
          style={authStyles.input}
          disabled={submitting}
        />
        {formState.errors.password && (
          <span style={authStyles.error}>{formState.errors.password.message}</span>
        )}
      </label>

      {error && <div style={authStyles.errorBox}>{error}</div>}

      <button
        type="submit"
        className="auth-primary"
        style={authStyles.primaryButton}
        disabled={submitting}
      >
        {submitting ? '로그인 중…' : '로그인'}
      </button>
    </form>
  )
}
