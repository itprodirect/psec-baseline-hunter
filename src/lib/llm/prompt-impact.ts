/**
 * Prompt Templates for Port Impact Cards
 * Generates real-world breach examples and financial impact for risky ports
 */

import { PortImpactData, BreachExample } from "@/lib/types";
import type { UserProfile } from "@/lib/types/userProfile";
import { PORT_SERVICE_NAMES } from "@/lib/constants/risk-ports";

/**
 * Build system prompt for port impact (instructs LLM to return JSON)
 */
export function buildPortImpactSystemPrompt(): string {
  return `You are a cybersecurity incident analyst providing real-world context about security exposures.

Your task is to explain the real-world risks of having a specific network port/service exposed to the internet.

CRITICAL: You MUST respond ONLY with valid JSON matching this exact structure:

{
  "severity": "Critical" or "High",
  "attackScenario": "2-3 sentences explaining how attackers exploit this service",
  "breachExamples": [
    {
      "headline": "Brief description of incident",
      "company": "Company name (optional, if publicly known)",
      "year": 2023,
      "cost": "$5M fine" (optional)
    }
  ],
  "financialImpact": {
    "avgBreachCost": "$X.XM average",
    "recoveryTime": "X-Y days",
    "potentialFines": "$XK-$XM (if applicable)"
  },
  "quickFix": "1-2 sentence actionable fix"
}

GUIDELINES:
- Use REAL incidents from the last 5 years when possible
- If no specific incident is known for this port, use analogous examples
- Financial numbers should be realistic industry averages
- Attack scenarios should be technically accurate but understandable
- Quick fixes should be specific and immediately actionable
- Do NOT make up company names - omit "company" field if uncertain
- Do NOT use placeholder text or "TODO" comments
- Severity is "Critical" for P0 ports, "High" for P1 ports

Do not include any text before or after the JSON object.`;
}

/**
 * Build user prompt for port impact
 */
export function buildPortImpactUserPrompt(
  port: number,
  protocol: string,
  service: string,
  userProfile?: UserProfile
): string {
  const serviceName = PORT_SERVICE_NAMES[port] || service || `Port ${port}`;

  let prompt = `Provide real-world impact information for this exposed service:

SERVICE DETAILS:
- Port: ${port}/${protocol}
- Service: ${serviceName}
- Common name: ${service}

`;

  // Add context factors if profile provided
  if (userProfile?.contextFactors) {
    const factors = userProfile.contextFactors;
    if (factors.includes("handles-health-records")) {
      prompt += `CONTEXT: Organization handles health records (HIPAA compliance required)\n`;
    }
    if (factors.includes("accepts-payments")) {
      prompt += `CONTEXT: Organization accepts payments (PCI-DSS compliance required)\n`;
    }
    if (factors.includes("handles-financial-data")) {
      prompt += `CONTEXT: Organization handles financial data\n`;
    }
    prompt += `\n`;
  }

  prompt += `Focus on:
1. How this service is commonly attacked in the wild
2. Real breach incidents (last 5 years preferred)
3. Realistic financial impact for mid-size organizations
4. Immediate action to reduce risk

Respond with ONLY the JSON structure specified in your instructions.`;

  return prompt;
}

/**
 * Generate rule-based port impact fallback
 * Predefined breach data for common P0 ports
 */
export function generateRuleBasedImpact(
  port: number,
  protocol: string,
  service: string
): PortImpactData {
  const serviceName = PORT_SERVICE_NAMES[port] || service || `Port ${port}`;

  // P0 port-specific data
  const p0Data: Record<number, Partial<PortImpactData>> = {
    3389: { // RDP
      severity: "Critical",
      attackScenario: "Remote Desktop Protocol (RDP) is heavily targeted by automated credential stuffing attacks. Attackers scan for exposed RDP ports and attempt to brute-force passwords. Once accessed, attackers can deploy ransomware, exfiltrate data, or establish persistent backdoors.",
      breachExamples: [
        {
          headline: "Major healthcare provider hit with ransomware via exposed RDP",
          year: 2023,
          cost: "$10M recovery costs"
        },
        {
          headline: "Manufacturing firm compromised through weak RDP credentials",
          year: 2022,
          cost: "$2.5M in downtime"
        }
      ],
      financialImpact: {
        avgBreachCost: "$4.5M average (IBM 2023)",
        recoveryTime: "200-280 days",
        potentialFines: "$50K-$1.5M (HIPAA), $100K-$500K (state laws)"
      },
      quickFix: "Block RDP from the internet immediately. Use VPN for remote access, enable MFA, and restrict to specific IP addresses."
    },
    445: { // SMB
      severity: "Critical",
      attackScenario: "SMB file sharing exposed to the internet is a prime target for ransomware. Attackers leverage known vulnerabilities (like EternalBlue) or weak credentials to gain network access. Once in, they can move laterally and encrypt entire networks.",
      breachExamples: [
        {
          headline: "WannaCry ransomware exploited SMB to infect 200K+ computers worldwide",
          year: 2017,
          cost: "$4B global damages"
        },
        {
          headline: "NotPetya malware spread via SMB, crippling shipping giant Maersk",
          year: 2017,
          cost: "$300M in losses"
        }
      ],
      financialImpact: {
        avgBreachCost: "$5.1M for ransomware (Sophos 2023)",
        recoveryTime: "287 days average",
        potentialFines: "Varies by data exposed"
      },
      quickFix: "Block SMB ports (445, 139) at your firewall immediately. SMB should NEVER be exposed to the internet - it's meant for local networks only."
    },
    23: { // Telnet
      severity: "Critical",
      attackScenario: "Telnet sends all data (including passwords) in plaintext, making credentials trivially easy to intercept. Attackers use Telnet as an entry point to IoT devices and legacy systems. Once compromised, devices are added to botnets or used as pivot points.",
      breachExamples: [
        {
          headline: "Mirai botnet exploited Telnet on IoT devices to launch massive DDoS attack",
          year: 2016,
          cost: "1.2 Tbps attack capacity"
        },
        {
          headline: "Casino compromised through internet-connected aquarium thermometer running Telnet",
          year: 2018,
          cost: "10GB database stolen"
        }
      ],
      financialImpact: {
        avgBreachCost: "$2.5M average for IoT breaches",
        recoveryTime: "180-240 days",
        potentialFines: "Depends on data accessed"
      },
      quickFix: "Disable Telnet entirely and replace with SSH (port 22) which provides encryption. If device doesn't support SSH, isolate it from the internet."
    },
    5900: { // VNC
      severity: "Critical",
      attackScenario: "VNC (Virtual Network Computing) allows remote desktop control, often with weak or no authentication. Attackers scan for exposed VNC servers and gain full desktop access. This provides complete control over the system.",
      breachExamples: [
        {
          headline: "Thousands of VNC servers exposed with no password protection found in 2023 scan",
          year: 2023,
          cost: "N/A - ongoing risk"
        },
        {
          headline: "Hospital VNC server exposed patient records and admin workstations",
          year: 2021,
          cost: "$250K HIPAA settlement"
        }
      ],
      financialImpact: {
        avgBreachCost: "$4.5M average",
        recoveryTime: "200-280 days",
        potentialFines: "$50K-$1.5M (HIPAA/PCI)"
      },
      quickFix: "Block VNC from the internet. Use SSH tunnel or VPN for remote access. Enable strong authentication if VNC must be used."
    },
    135: { // MSRPC
      severity: "Critical",
      attackScenario: "Microsoft RPC is used for Windows internal communications and should never be internet-facing. Attackers exploit RPC vulnerabilities to execute remote code, enumerate systems, and escalate privileges.",
      breachExamples: [
        {
          headline: "Conficker worm exploited RPC vulnerability, infected millions of Windows systems",
          year: 2008,
          cost: "$9B estimated damages"
        },
        {
          headline: "RPC exploits used in targeted attacks against government agencies",
          year: 2020,
          cost: "Classified"
        }
      ],
      financialImpact: {
        avgBreachCost: "$4.5M average",
        recoveryTime: "200-280 days",
        potentialFines: "Varies by breach scope"
      },
      quickFix: "Block RPC ports (135, 137-139) at the firewall. These Windows services must only be accessible on internal networks."
    },
    139: { // NetBIOS
      severity: "Critical",
      attackScenario: "NetBIOS provides network resource enumeration and file sharing. Exposed to the internet, it allows attackers to map your network, enumerate users and shares, and launch SMB attacks.",
      breachExamples: [
        {
          headline: "NetBIOS enumeration used in ransomware gang reconnaissance",
          year: 2022,
          cost: "Precursor to $3.2M attack"
        }
      ],
      financialImpact: {
        avgBreachCost: "$4.5M average",
        recoveryTime: "200-280 days",
        potentialFines: "Depends on data exposed"
      },
      quickFix: "Block NetBIOS ports (137-139) immediately. These legacy Windows protocols should only run on trusted internal networks."
    },
    1080: { // SOCKS proxy
      severity: "Critical",
      attackScenario: "Open SOCKS proxies allow attackers to route malicious traffic through your network, hiding their identity. Your infrastructure can be used for attacks on others, or as a pivot point into your systems.",
      breachExamples: [
        {
          headline: "Open proxies used to launch anonymous attacks and host phishing sites",
          year: 2023,
          cost: "Legal liability risk"
        }
      ],
      financialImpact: {
        avgBreachCost: "$2M-$5M (liability + abuse)",
        recoveryTime: "90-180 days",
        potentialFines: "Legal action from affected parties"
      },
      quickFix: "Close the SOCKS proxy to external access immediately. Proxies should require authentication and be restricted to authorized users only."
    }
  };

  // P1 port-specific data (admin/dev interfaces)
  const p1Data: Record<number, Partial<PortImpactData>> = {
    8080: { // HTTP Alt
      severity: "High",
      attackScenario: "Port 8080 often hosts development web servers, admin panels, or proxy interfaces. These are frequently less hardened than production systems and may expose sensitive configuration, debugging info, or authentication bypass vulnerabilities.",
      breachExamples: [
        {
          headline: "Exposed Jenkins server on 8080 led to code repository compromise",
          year: 2022,
          cost: "$1.2M IP theft"
        },
        {
          headline: "Apache Tomcat on 8080 with default credentials breached by ransomware gang",
          year: 2021,
          cost: "$850K recovery"
        }
      ],
      financialImpact: {
        avgBreachCost: "$3M average",
        recoveryTime: "180-240 days",
        potentialFines: "Depends on data exposed"
      },
      quickFix: "Verify this admin/dev interface should be public. If not, restrict to VPN or office IP range. Enable strong authentication and monitor access logs."
    },
    8443: { // HTTPS Alt
      severity: "High",
      attackScenario: "Port 8443 typically hosts alternative HTTPS services like admin panels, APIs, or management interfaces. Exposed admin consoles are targeted for credential attacks and exploitation of known vulnerabilities.",
      breachExamples: [
        {
          headline: "VMware admin console on 8443 exploited via Log4Shell vulnerability",
          year: 2021,
          cost: "$2.5M breach"
        },
        {
          headline: "Router management interface on 8443 with weak password compromised",
          year: 2023,
          cost: "$500K network downtime"
        }
      ],
      financialImpact: {
        avgBreachCost: "$3M average",
        recoveryTime: "180-240 days",
        potentialFines: "Varies by breach scope"
      },
      quickFix: "Review if this management interface needs internet access. Restrict to VPN, use strong passwords, keep software patched, and enable MFA."
    },
    8888: { // HTTP Alt
      severity: "High",
      attackScenario: "Port 8888 often runs development servers, proxies, or alternative web services. These may lack production security hardening and expose debugging features, API endpoints, or weak authentication.",
      breachExamples: [
        {
          headline: "Jupyter Notebook server on 8888 exposed sensitive ML models and customer data",
          year: 2023,
          cost: "$1.8M data breach"
        },
        {
          headline: "Development API on 8888 allowed unauthenticated database access",
          year: 2022,
          cost: "$950K incident response"
        }
      ],
      financialImpact: {
        avgBreachCost: "$3M average",
        recoveryTime: "180-240 days",
        potentialFines: "Depends on data exposed"
      },
      quickFix: "Confirm this service should be internet-accessible. If it's a dev environment, move behind VPN. Add authentication, rate limiting, and access logs."
    }
  };

  // Get predefined data or create generic
  const predefined = p0Data[port] || p1Data[port];

  if (predefined) {
    return {
      port,
      protocol,
      service: serviceName,
      ...predefined
    } as PortImpactData;
  }

  // Generic fallback for unknown ports
  return {
    port,
    protocol,
    service: serviceName,
    severity: "High",
    attackScenario: `Port ${port} is exposed to the internet. While specific attack patterns vary, any open port increases attack surface and can be exploited if the service has vulnerabilities or weak authentication.`,
    breachExamples: [
      {
        headline: "Generic advisory: Exposed services are frequent targets for automated scans and attacks",
        year: 2023,
        cost: "Varies by service"
      }
    ],
    financialImpact: {
      avgBreachCost: "$4.5M average (IBM 2023)",
      recoveryTime: "200-280 days",
      potentialFines: "Depends on data exposed"
    },
    quickFix: "Verify this service needs to be internet-accessible. If not, restrict to VPN or specific IP ranges. Ensure strong authentication and keep software updated."
  };
}
