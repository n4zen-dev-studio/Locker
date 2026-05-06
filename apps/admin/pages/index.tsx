import { useEffect } from "react"
import { useRouter } from "next/router"
import { getStoredToken } from "../lib/api"

export default function IndexPage() {
  const router = useRouter()

  useEffect(() => {
    const token = getStoredToken()
    if (token) {
      router.replace("/dashboard")
    } else {
      router.replace("/login")
    }
  }, [router])

  return null
}
