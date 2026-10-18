package app.dsbot.notifications

import java.net.URI
import java.security.MessageDigest
import java.security.cert.X509Certificate
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLSocketFactory
import javax.net.ssl.X509TrustManager
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit

internal object LocalTLS {
  fun validPin(pin: String) = pin.matches(Regex("sha256:[a-f0-9]{64}"))
  fun validate(origin: String, url: String, socket: Boolean = false) {
    val base = URI(origin)
    val target = URI(url)
    check(base.scheme == "https" && base.host != null && base.userInfo == null && base.query == null && base.fragment == null && base.path in listOf("", "/")) { "Invalid HTTPS origin" }
    check(target.scheme == (if (socket) "wss" else "https") && target.host == base.host && (if (target.port == -1) 443 else target.port) == (if (base.port == -1) 443 else base.port) && target.userInfo == null && target.fragment == null && target.path.startsWith("/mobile/v1/")) { "The request belongs to another host" }
  }
  fun factory(pin: String): Pair<SSLSocketFactory, X509TrustManager> {
    check(validPin(pin)) { "Invalid computer identity" }
    val trust = object : X509TrustManager {
      override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
      override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) { throw java.security.cert.CertificateException("Client certificates are unavailable") }
      override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {
        if (chain.size != 1) throw java.security.cert.CertificateException("Expected the paired computer certificate")
        val cert = chain[0]
        cert.checkValidity()
        val actual = "sha256:" + MessageDigest.getInstance("SHA-256").digest(cert.publicKey.encoded).joinToString("") { "%02x".format(it.toInt() and 255) }
        if (!MessageDigest.isEqual(actual.toByteArray(Charsets.US_ASCII), pin.toByteArray(Charsets.US_ASCII)) || cert.subjectX500Principal != cert.issuerX500Principal) throw java.security.cert.CertificateException("The computer identity changed")
        cert.verify(cert.publicKey)
        if (cert.basicConstraints >= 0 || cert.extendedKeyUsage?.contains("1.3.6.1.5.5.7.3.1") != true || cert.keyUsage?.get(0) != true) throw java.security.cert.CertificateException("Invalid server certificate")
      }
    }
    val context = SSLContext.getInstance("TLS")
    context.init(null, arrayOf(trust), null)
    return Pair(context.socketFactory, trust)
  }
  fun client(pin: String): OkHttpClient {
    val (factory, trust) = factory(pin)
    // OkHttp keeps its standard hostname/SAN verifier; only this paired origin uses this trust manager.
    return OkHttpClient.Builder().sslSocketFactory(factory, trust).followRedirects(false).followSslRedirects(false)
      .connectTimeout(10, TimeUnit.SECONDS).readTimeout(45, TimeUnit.SECONDS).callTimeout(60, TimeUnit.SECONDS).build()
  }
}
