import React, { Component } from 'react';
import logo from './logo.svg';
import './App.css';
import { withAuthenticator } from 'aws-amplify-react'
import Amplify, { Auth } from 'aws-amplify';
import aws_exports from './aws-exports';
Amplify.configure(aws_exports);

const REGION = 'us-east-2';

Amplify.Storage.configure({
  AWSS3: {
    // devm TEST ENVIRONMENT
    bucket: 'covid-chi-105443-devm',
    // prod ENVIRONMENT 
    // bucket: 'covid-chi-1app-prod',
    region: REGION
  }
});

class App extends Component {

  constructor(props) {
    super(props);

    this.state = {
      chartsByDate: [],
      chartsByPatientId: [],
      activeChart: logo,
    };

    Amplify.Storage.list('')
      .then(result => {
        let id = 0;
        result.forEach(element => {
          const chartRegex = /patient_id=([a-zA-Z0-9]+)\/gender=[mfo]\/yyyymmdd=(\d{8})\/.*.png/
          const matches = element.key.match(chartRegex)
          if(matches) {
            console.log(element.key)
            const patient_id = matches[1];
            const date = matches[2];
            const key = element.key;
            this.state.chartsByPatientId.push({id: id, patient_id: patient_id, key: key});
            this.state.chartsByDate.push({date: date, id: id, key: key});
            id++;
            this.setState({chartsByDate: this.state.chartsByDate, chartsByPatientId: this.state.chartsByPatientId}, () => {
              console.log("A")
              if(this.state.chartsByDate.length > 0) {
                console.log("B")
                console.log(this.state.chartsByDate[0].key)
                Amplify.Storage.get(this.state.chartsByDate[0].key)
                  .then((result) => {
                    console.log("C")
                    console.log(result);
                    this.setState({activeChart: result})
                  });
              }
            });
          } 
        });
      })
      .catch(err => console.log(err));
  }

  render() {
    return (
      <div className="App">
        <header className="App-header">
          <img src={this.state.activeChart} alt="logo" className="App-chart"/>
        </header>
        <ol>{this.state.chartsByDate.map((v) => <li key={v.key}>{JSON.stringify(v)}</li>)}</ol>
        <ol>{this.state.chartsByPatientId.map((v) => <li key={v.key}>{JSON.stringify(v)}</li>)}</ol>


      </div>
    );
  }
}

export default withAuthenticator(App, true);
