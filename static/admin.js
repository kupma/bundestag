// Admin page: PDF upload without a multipart parser on the server. With a file
// chosen, the form's fields go into the query string and the PDF is the raw
// request body; without one, the form posts normally and the server downloads
// the PDF from the given address.
(function () {
  const form = document.getElementById('program-form');
  const file = document.getElementById('file');
  const status = document.getElementById('upload-status');
  if (form && file) {
    form.addEventListener('submit', async (event) => {
      if (!file.files || !file.files[0]) return;
      event.preventDefault();
      const params = new URLSearchParams();
      for (const name of ['party', 'title', 'kind', 'election', 'source_url']) params.set(name, form.elements[name].value);
      status.textContent = 'Wird hochgeladen …';
      try {
        const res = await fetch('/admin/programme/upload?' + params.toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/pdf' },
          body: file.files[0],
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Upload fehlgeschlagen (' + res.status + ')');
        location.href = '/admin?ok=import';
      } catch (err) {
        status.textContent = err.message;
      }
    });
  }
  for (const f of document.querySelectorAll('form.confirm')) {
    f.addEventListener('submit', (event) => {
      if (!confirm(f.dataset.confirm || 'Sicher?')) event.preventDefault();
    });
  }
})();
