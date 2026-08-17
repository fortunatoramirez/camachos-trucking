function clean(value, maxLength = 500) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function escapeHtml(value) {
  return clean(value, 5000)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function onRequestPost(context) {
  try {
    const contentType = context.request.headers.get("content-type") || "";

    if (!contentType.includes("application/json")) {
      return Response.json(
        { ok: false, message: "Formato de solicitud no válido." },
        { status: 415 }
      );
    }

    const data = await context.request.json();

    const name = clean(data.name, 120);
    const company = clean(data.company, 160);
    const email = clean(data.email, 254);
    const phone = clean(data.phone, 80);
    const origin = clean(data.origin, 160);
    const destination = clean(data.destination, 160);
    const cargo = clean(data.cargo, 200);
    const message = clean(data.message, 3000);

    // Campo honeypot: debe permanecer vacío para usuarios reales.
    const website = clean(data.website, 200);
    if (website) {
      return Response.json({ ok: true });
    }

    if (!name || !email || !isValidEmail(email)) {
      return Response.json(
        { ok: false, message: "Nombre y correo válido son obligatorios." },
        { status: 400 }
      );
    }

    if (!context.env.RESEND_API_KEY) {
      console.error("RESEND_API_KEY is not configured");
      return Response.json(
        { ok: false, message: "El servicio de correo no está configurado." },
        { status: 500 }
      );
    }

    const subjectParts = ["Nueva solicitud de cotización"];
    if (company) subjectParts.push(company);
    if (origin || destination) {
      subjectParts.push(`${origin || "?"} → ${destination || "?"}`);
    }

    const text = [
      "Nueva solicitud desde camachos-trucking.com",
      "",
      `Nombre: ${name}`,
      `Empresa: ${company || "No indicada"}`,
      `Correo: ${email}`,
      `Teléfono: ${phone || "No indicado"}`,
      `Origen: ${origin || "No indicado"}`,
      `Destino: ${destination || "No indicado"}`,
      `Tipo de carga: ${cargo || "No indicado"}`,
      "",
      "Mensaje:",
      message || "Sin mensaje adicional"
    ].join("\n");

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.5;color:#1f2937;max-width:680px;margin:auto">
        <h2 style="margin-bottom:18px">Nueva solicitud de cotización</h2>
        <table style="border-collapse:collapse;width:100%">
          <tr><td style="padding:7px 10px;font-weight:700">Nombre</td><td style="padding:7px 10px">${escapeHtml(name)}</td></tr>
          <tr><td style="padding:7px 10px;font-weight:700">Empresa</td><td style="padding:7px 10px">${escapeHtml(company || "No indicada")}</td></tr>
          <tr><td style="padding:7px 10px;font-weight:700">Correo</td><td style="padding:7px 10px">${escapeHtml(email)}</td></tr>
          <tr><td style="padding:7px 10px;font-weight:700">Teléfono</td><td style="padding:7px 10px">${escapeHtml(phone || "No indicado")}</td></tr>
          <tr><td style="padding:7px 10px;font-weight:700">Origen</td><td style="padding:7px 10px">${escapeHtml(origin || "No indicado")}</td></tr>
          <tr><td style="padding:7px 10px;font-weight:700">Destino</td><td style="padding:7px 10px">${escapeHtml(destination || "No indicado")}</td></tr>
          <tr><td style="padding:7px 10px;font-weight:700">Tipo de carga</td><td style="padding:7px 10px">${escapeHtml(cargo || "No indicado")}</td></tr>
        </table>
        <h3 style="margin-top:22px">Mensaje</h3>
        <p style="white-space:pre-wrap">${escapeHtml(message || "Sin mensaje adicional")}</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
        <p style="font-size:13px;color:#6b7280">Enviado desde el formulario de camachos-trucking.com</p>
      </div>
    `;

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${context.env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "Camacho's Trucking Website <website@forms.camachos-trucking.com>",
        to: ["quotes@camachos-trucking.com"],
        reply_to: email,
        subject: subjectParts.join(" | "),
        text,
        html
      })
    });

    const resendData = await resendResponse.json().catch(() => ({}));

    if (!resendResponse.ok) {
      console.error("Resend error", resendResponse.status, resendData);
      return Response.json(
        { ok: false, message: "No fue posible enviar la solicitud." },
        { status: 502 }
      );
    }

    return Response.json({ ok: true, id: resendData.id });
  } catch (error) {
    console.error("Contact form error", error);
    return Response.json(
      { ok: false, message: "Ocurrió un error al procesar la solicitud." },
      { status: 500 }
    );
  }
}

export function onRequest(context) {
  return Response.json(
    { ok: false, message: "Método no permitido." },
    { status: 405, headers: { Allow: "POST" } }
  );
}
