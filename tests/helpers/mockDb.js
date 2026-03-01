const createMockDb = () => ({
  query: jest.fn(),
  pool: {
    connect: jest.fn().mockResolvedValue({
      query: jest.fn(),
      release: jest.fn(),
    })
  }
});

module.exports = { createMockDb };
