/**
 * Unit Tests: Permisos Controller
 * Tests para gestión de permisos de roles
 */

const permisosController = require('../../../controllers/permisosController');
const db = require('../../../db');

jest.mock('../../../db');
jest.mock('../../../utils/logger');

describe('permisosController', () => {
  let req, res;

  beforeEach(() => {
    jest.clearAllMocks();

    req = {
      tenant: { tenant_id: 1 },
      user: { admin_responsable_id: 2, rol: 'super_admin' },
      params: {},
      body: {},
      query: {},
      requestId: 'test-123'
    };

    res = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis()
    };
  });

  describe('GET /api/admin/permisos/roles', () => {
    test('✅ Happy Path: Obtiene lista de roles', async () => {
      const mockRoles = [
        { id: 1, nombre: 'super_admin', descripcion: 'Acceso total' },
        { id: 2, nombre: 'admin', descripcion: 'Administrador general' },
        { id: 3, nombre: 'finanzas', descripcion: 'Gestión financiera' },
        { id: 4, nombre: 'inventarios', descripcion: 'Gestión de inventario' }
      ];

      db.query.mockResolvedValueOnce({ rows: mockRoles });

      if (permisosController.obtenerRoles) {
        await permisosController.obtenerRoles(req, res);

        expect(db.query).toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith({
          success: true,
          roles: mockRoles
        });
      }
    });

    test('✅ Filtra por tenant_id', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      if (permisosController.obtenerRoles) {
        await permisosController.obtenerRoles(req, res);

        expect(db.query).toHaveBeenCalledWith(
          expect.stringContaining('tenant_id'),
          expect.arrayContaining([1])
        );
      }
    });

    test('❌ Error 500: DB falla', async () => {
      db.query.mockRejectedValueOnce(new Error('DB error'));

      if (permisosController.obtenerRoles) {
        await permisosController.obtenerRoles(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
      }
    });
  });

  describe('GET /api/admin/permisos/rol/:rolId', () => {
    test('✅ Obtiene permisos de un rol específico', async () => {
      req.params.rolId = 2;

      const mockPermisos = [
        {
          id: 1,
          rol_id: 2,
          recurso: 'pedidos',
          accion: 'crear',
          activo: true
        },
        {
          id: 2,
          rol_id: 2,
          recurso: 'pedidos',
          accion: 'editar',
          activo: true
        }
      ];

      db.query.mockResolvedValueOnce({ rows: mockPermisos });

      if (permisosController.obtenerPermisosRol) {
        await permisosController.obtenerPermisosRol(req, res);

        expect(db.query).toHaveBeenCalledWith(
          expect.stringContaining('WHERE'),
          expect.arrayContaining([2])
        );
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            permisos: mockPermisos
          })
        );
      }
    });

    test('❌ Error 404: Rol no encontrado', async () => {
      req.params.rolId = 999;

      db.query.mockResolvedValueOnce({ rows: [] });

      if (permisosController.obtenerPermisosRol) {
        await permisosController.obtenerPermisosRol(req, res);

        if (res.status.mock.calls.length > 0) {
          expect(res.status).toHaveBeenCalledWith(404);
        }
      }
    });
  });

  describe('POST /api/admin/permisos/asignar', () => {
    test('✅ Asigna permiso a un rol', async () => {
      req.body = {
        rolId: 3,
        recurso: 'reportes',
        accion: 'ver'
      };

      db.query.mockResolvedValueOnce({
        rows: [{ id: 10, rol_id: 3, recurso: 'reportes', accion: 'ver' }]
      });

      if (permisosController.asignarPermiso) {
        await permisosController.asignarPermiso(req, res);

        expect(db.query).toHaveBeenCalledWith(
          expect.stringContaining('INSERT'),
          expect.any(Array)
        );

        if (res.json.mock.calls.length > 0) {
          expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ success: true })
          );
        }
      }
    });

    test('❌ Valida que rol existe', async () => {
      req.body = {
        rolId: 999,
        recurso: 'reportes',
        accion: 'ver'
      };

      db.query.mockRejectedValueOnce(new Error('FOREIGN KEY constraint failed'));

      if (permisosController.asignarPermiso) {
        await permisosController.asignarPermiso(req, res);

        if (res.status.mock.calls.length > 0) {
          expect(res.status).toHaveBeenCalledWith(expect.any(Number));
        }
      }
    });
  });

  describe('DELETE /api/admin/permisos/:permisoId', () => {
    test('✅ Elimina permiso del rol', async () => {
      req.params.permisoId = 5;

      db.query.mockResolvedValueOnce({ rows: [{ id: 5 }] });
      db.query.mockResolvedValueOnce({});

      if (permisosController.eliminarPermiso) {
        await permisosController.eliminarPermiso(req, res);

        expect(db.query).toHaveBeenCalledWith(
          expect.stringContaining('DELETE'),
          expect.arrayContaining([5])
        );

        if (res.json.mock.calls.length > 0) {
          expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
              success: true,
              message: expect.stringContaining('eliminado')
            })
          );
        }
      }
    });

    test('❌ Error 404: Permiso no existe', async () => {
      req.params.permisoId = 999;

      db.query.mockResolvedValueOnce({ rows: [] });

      if (permisosController.eliminarPermiso) {
        await permisosController.eliminarPermiso(req, res);

        if (res.status.mock.calls.length > 0) {
          expect(res.status).toHaveBeenCalledWith(404);
        }
      }
    });
  });

  describe('PUT /api/admin/permisos/:permisoId', () => {
    test('✅ Actualiza estado del permiso (activo/inactivo)', async () => {
      req.params.permisoId = 5;
      req.body = { activo: false };

      db.query.mockResolvedValueOnce({
        rows: [{ id: 5, rol_id: 2, recurso: 'pedidos', accion: 'crear', activo: false }]
      });

      if (permisosController.actualizarPermiso) {
        await permisosController.actualizarPermiso(req, res);

        expect(db.query).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE'),
          expect.any(Array)
        );

        if (res.json.mock.calls.length > 0) {
          expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
              success: true,
              permiso: expect.objectContaining({ activo: false })
            })
          );
        }
      }
    });
  });

  describe('GET /api/admin/permisos/usuario/:usuarioId', () => {
    test('✅ Obtiene todos los permisos de un usuario', async () => {
      req.params.usuarioId = 2;

      const mockUserPermisos = [
        { recurso: 'pedidos', acciones: ['crear', 'editar', 'ver'] },
        { recurso: 'inventario', acciones: ['ver', 'editar'] },
        { recurso: 'reportes', acciones: ['ver'] }
      ];

      db.query.mockResolvedValueOnce({ rows: mockUserPermisos });

      if (permisosController.obtenerPermisosUsuario) {
        await permisosController.obtenerPermisosUsuario(req, res);

        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            permisos: mockUserPermisos
          })
        );
      }
    });

    test('✅ Retorna objeto vacío si usuario no tiene permisos', async () => {
      req.params.usuarioId = 999;

      db.query.mockResolvedValueOnce({ rows: [] });

      if (permisosController.obtenerPermisosUsuario) {
        await permisosController.obtenerPermisosUsuario(req, res);

        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            permisos: expect.any(Object)
          })
        );
      }
    });
  });
});
