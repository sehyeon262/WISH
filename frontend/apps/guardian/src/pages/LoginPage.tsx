import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { login as loginApi } from '@wish/api-client'
import { useAuthStore } from '@/shared/auth/store'
import logoImage from '@/assets/logo.png'
import modelImage from '@/assets/model.png'
import styles from './LoginPage.module.css'

const loginSchema = z.object({
  email: z.string().email('올바른 이메일을 입력하세요'),
  password: z.string().min(1, '비밀번호를 입력하세요'),
})

type LoginForm = z.infer<typeof loginSchema>

type LocationState = {
  signedUpEmail?: string
}

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { setToken, token } = useAuthStore()
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const signedUpEmail = (location.state as LocationState | null)?.signedUpEmail

  const { register, handleSubmit, formState } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: signedUpEmail ?? '', password: '' },
  })

  useEffect(() => {
    if (token) {
      navigate('/', { replace: true })
    }
  }, [token, navigate])

  const onSubmit = async (values: LoginForm) => {
    setError(null)
    setSubmitting(true)
    try {
      const response = await loginApi(values)
      setToken(response.data.accessToken)
      navigate('/', { replace: true })
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
    <div className={styles.page}>
      <div className={styles.layout}>
        <div className={styles.cardWrapper}>
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <img src={logoImage} alt="WISH" className={styles.logo} />
              <Link to="/signup" className={styles.signupLink}>
                계정이 없으신가요?
                <strong>회원가입</strong>
              </Link>
            </div>

            <h1 className={styles.title}>로그인</h1>

            {signedUpEmail && (
              <div className={styles.notice}>가입이 완료되었습니다. 로그인해주세요.</div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className={styles.form}>
              <div className={styles.field}>
                <span className={styles.label}>이메일</span>
                <input
                  type="email"
                  autoComplete="email"
                  {...register('email')}
                  className={styles.input}
                  disabled={submitting}
                  placeholder="example@email.com"
                />
                {formState.errors.email && (
                  <span className={styles.errorText}>{formState.errors.email.message}</span>
                )}
              </div>

              <div className={styles.field}>
                <span className={styles.label}>비밀번호</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  {...register('password')}
                  className={styles.input}
                  disabled={submitting}
                  placeholder="비밀번호"
                />
                {formState.errors.password && (
                  <span className={styles.errorText}>{formState.errors.password.message}</span>
                )}
              </div>

              {error && <div className={styles.errorBox}>{error}</div>}

              <button type="submit" className={styles.submit} disabled={submitting}>
                {submitting ? '로그인 중…' : '로그인'}
              </button>
            </form>
          </div>
        </div>

        <div className={styles.illustrationWrapper}>
          <img src={modelImage} alt="" className={styles.illustration} />
        </div>
      </div>
    </div>
  )
}
