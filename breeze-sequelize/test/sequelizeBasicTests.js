// These tests assume access to a mySql installation
var fs               = require("fs");
var expect           = require("chai").expect;
var Sequelize        = require('sequelize');
var uuid             = require('node-uuid');
var Promise          = require('bluebird');

var utils            = require('./../utils.js');
var dbUtils          = require('./../dbUtils.js');
var SequelizeManager = require('./../SequelizeManager');

var _ = Sequelize.Utils._;
var log = utils.log;
// log.enabled = false;

describe.only("sequelizeBasic", function() {

  var _dbConfig = {
    host: "localhost",
    user: "jayt",
    password: "password",
    dbName: 'test1'
  }

  var _nwSm;

  this.enableTimeouts(false);

  before(function(done) {
    var nwConfig = _.clone(_dbConfig);
    nwConfig.dbName = "NorthwindIB_temp";
    var sm = new SequelizeManager(nwConfig);
    var breezeMetadata = fs.readFileSync('./sampleMetadata.json', { encoding: 'utf8' });
    var json = JSON.parse(breezeMetadata);
    // removing naming convention so that we don't camel case the data.
    json.namingConvention = null;
    sm.importMetadata(json);
    sm.sync(true).then(function() {
      _nwSm = sm;
    }).then(done, done)

   });



  it("should create a simple schema", function(done) {
    var sm = new SequelizeManager(_dbConfig);
    createSimpleSchema(sm.sequelize);
    // this will not work but the line after will;
    // sm.sync(true).then(done, done);
    // sm.sync(true).then(done.bind(null, null), done);
    // or
    sm.sync(true).then(noop).then(done, done);

  });


  it("should convert breeze metadata", function() {
    expect(_nwSm).to.exist; // should.exist(_nwSm);
    var CustomerModel = _nwSm.models.Customers;
    expect(CustomerModel).to.exist; // should.exist(CustomerModel);
  });

  it("should insert with build & save", function(done) {
    var Customer = _nwSm.models.Customers;
    var dtos = createCustDTOs();
    var cust1 = Customer.build( dtos[0]);
    cust1.save().then(function(c1) {
      expect(c1.companyName).to.equal("Test 1");
    }).then(function() {
      var cust2 = Customer.build( dtos[1]);
      return cust2.save();
    }).then(function(c2) {
      expect(c2.companyName).to.eql("Test 2");
    }).then(done, done);
  });

  it("should insert with create", function(done) {
    var Customer = _nwSm.models.Customers;
    var dtos = createCustDTOs();
    Customer.create( dtos[0] ).then(function(c1) {
      expect(c1.companyName).to.equal("Test 1");
      return Customer.create( dtos[1]);
    }).then(function(c2) {
      expect(c2.companyName).to.equal("Test 2");
    }).then(done, done);
  });

  it("should insert with bulk create", function(done) {
    var Customer = _nwSm.models.Customers;
    var dtos = createCustDTOs();
    Customer.bulkCreate( dtos).then(function(r) {
      expect(r).to.have.length(dtos.length);
    }).then(done, done);
  });

  it("should insert with create and an autogenerated key", function(done) {
    var Employee = _nwSm.models.Employees;
    var dtos = createEmpDTOs();
    var emp0, emp1;
    Employee.create(dtos[0]).then(function(emp) {
      emp0 = emp;
      // this 1st one will always be 0
      expect(emp0.employeeID).not.to.equal(0);
      return Employee.create(dtos[1]);
    }).then(function(emp) {
      emp1 = emp;
      expect(emp1.employeeID).not.to.equal(emp0.employeeID);
    }).then(done, done);

  });

  it("should insert with create using promises 'all' and an autogenerated key", function(done) {
    var Employee = _nwSm.models.Employees;
    var dtos = createEmpDTOs();
    Promise.all(dtos.map(function(dto) {
      return Employee.create(dto);
    })).then(function(emps) {
      expect(emps).to.have.length(dtos.length);
    }).then(done, done);
  });

  it("should insert with bulkCreate and an autogenerated key", function(done) {
    var Employee = _nwSm.models.Employees;
    var dtos = createEmpDTOs();

    // Will not be able to use this feature because
    // Sequelize does not provide a way to retrieve the key when using bulkCreate
    Employee.bulkCreate( dtos).then(function(r) {
      expect(r).to.have.length(dtos.length);
    }).then(done, done);
  });

  it("should create associations", function(done) {
    var Employee = _nwSm.models.Employees;
    var Customer = _nwSm.models.Customers;
    var Order    = _nwSm.models.Orders;
    var emps, custs, orders;
    var dtos = createEmpDTOs();
    Promise.all(createEmpDTOs().map(function(dto) {
      return Employee.create(dto);
    })).then(function(r) {
      emps = r;
      expect(emps).to.have.length(dtos.length);
      return Promise.all(createCustDTOs().map(function(dto) {
        return Customer.create(dto);
      }));
    }).then(function(r) {
      custs = r;
      dtos = createOrderDTOs(custs[0], emps[0]);
      return Promise.all(dtos.map(function(dto) {
        return Order.create(dto);
      }));
    }).then(function(r) {
      orders = r;
      expect(orders).to.have.length(dtos.length);
      expect(orders[0].customerID).to.equal(custs[0].customerID);
      expect(orders[0].employeeID).to.equal(emps[0].employeeID);
      return Customer.find( { where: { customerID: custs[0].customerID }, include: { model: Order, as: "orders" }});
    }).then(function(c0) {
      expect(c0.customerID).to.equal(custs[0].customerID);
      var orderIds0 = _.pluck(orders, "orderID");
      var orderIds1 = _.pluck(c0.orders, "orderID");
      expect(_.difference(orderIds0, orderIds1)).to.be.empty;
    }).then(done, done);
  });
});

function createCustDTOs() {
  return [
    { customerID: uuid.v1(), companyName: "Test 1", city: "Los Angeles" },
    { customerID: uuid.v1(), companyName: "Test 2", city: "Oakland" }
  ];
}

function createEmpDTOs() {
  return [
    {   lastName: "Smith", firstName: "Don", birthDate: new Date(2001, 0, 1)},
    {   lastName: "Doe",   firstName: "John", birthDate: new Date(2001, 1, 1)},
    {   lastName: "Smith", firstName: "Mary", birthDate: new Date(2001, 2, 1)}
  ];
}

function createOrderDTOs(cust, emp) {
  return [
    {  customerID: cust.customerID, employeeID: emp.employeeID, orderDate: new Date(2013,0,1) },
    {  customerID: cust.customerID, employeeID: emp.employeeID, orderDate: new Date(2013,1,1) },
    {  customerID: cust.customerID, employeeID: emp.employeeID, orderDate: new Date(2013,2,1) }
  ];
}

function noop() {};




function createSimpleSchema(sequelize) {
  var Customer = sequelize.define("customer", {
    customerId: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
    companyName: { type: Sequelize.STRING, allowNull: false },
    city: { type: Sequelize.STRING }
  });
  var Order = sequelize.define("order", {
    orderId: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
    shippingCost: {type: Sequelize.DECIMAL(11,2), allowNull: false },
    orderDate: { type: Sequelize.DATE  },
    shipDate: { type: Sequelize.DATE }
  });
  Order.belongsTo(Customer, { as: "myCustomer", foreignKey: "custId"});
  Customer.hasMany(Order, { as: "myOrders", foreignKey: "custId" } );

}

