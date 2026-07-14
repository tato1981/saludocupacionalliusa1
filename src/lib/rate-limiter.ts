interface RateLimitInfo {
  attempts: number;
  blockedUntil: number | null;
}

class InMemoryRateLimiter {
  private store: Map<string, RateLimitInfo> = new Map();

  // Configuración: 5 intentos cada 15 minutos
  private maxAttempts = 5;
  private windowMs = 15 * 60 * 1000; // 15 minutos en milisegundos

  // Verificar si la IP está bloqueada
  isBlocked(ip: string): { blocked: boolean; remainingMinutes: number } {
    const now = Date.now();
    const info = this.store.get(ip);

    if (info && info.blockedUntil && info.blockedUntil > now) {
      const remainingMs = info.blockedUntil - now;
      const remainingMinutes = Math.ceil(remainingMs / (60 * 1000));
      return { blocked: true, remainingMinutes };
    }

    // Si el bloqueo ya pasó, limpiar el registro
    if (info && info.blockedUntil && info.blockedUntil <= now) {
      this.store.delete(ip);
    }

    return { blocked: false, remainingMinutes: 0 };
  }

  // Registrar un intento fallido
  recordFailure(ip: string): void {
    const now = Date.now();
    let info = this.store.get(ip);

    if (!info) {
      info = { attempts: 1, blockedUntil: null };
      this.store.set(ip, info);
      
      // Limpiar automáticamente el contador después de 15 minutos
      setTimeout(() => {
        const current = this.store.get(ip);
        if (current && !current.blockedUntil) {
          this.store.delete(ip);
        }
      }, this.windowMs);
      return;
    }

    info.attempts += 1;

    if (info.attempts >= this.maxAttempts) {
      info.blockedUntil = now + this.windowMs;
      
      // Limpiar después de que expire el bloqueo
      setTimeout(() => {
        this.store.delete(ip);
      }, this.windowMs);
    }
  }

  // Resetear intentos de una IP (tras login exitoso)
  reset(ip: string): void {
    this.store.delete(ip);
  }
}

export const rateLimiter = new InMemoryRateLimiter();
