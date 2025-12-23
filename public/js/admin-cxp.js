// Evento de descarga de lote CxP
document.getElementById('btn-descargar-cxp')?.addEventListener('click', async () => {
    try {
        Swal.fire({
            title: 'Generando Lote de Pagos...',
            text: 'Por favor espera mientras procesamos los registros pendientes.',
            allowOutsideClick: false,
            didOpen: () => { Swal.showLoading() }
        });

        const response = await fetch('/api/admin/cxp/exportar', { method: 'GET' });

        if (response.status === 404) {
            Swal.fire('Sin Datos', 'No hay pagos pendientes de exportar.', 'info');
            return;
        }

        if (!response.ok) throw new Error('Error al generar reporte');

        // Descarga del archivo
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `CXP_Pendientes_${new Date().toISOString().slice(0,10)}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();

        // Éxito y recarga
        Swal.fire({
            icon: 'success',
            title: 'Lote Generado',
            text: 'Los registros han sido archivados correctamente'
        }).then(() => {
            if (typeof cargarTablaCxP === 'function') {
                cargarTablaCxP(); // Recargar tabla si existe la función
            }
        });

    } catch (error) {
        console.error(error);
        Swal.fire('Error', 'No se pudo generar el reporte.', 'error');
    }
});
